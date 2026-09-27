import { supabase } from '../lib/supabase'

/** Open missions can be joined with their code; complete missions are visible to everyone. */
export type MissionStatus = 'open' | 'complete'
/** Public missions show up when browsing; unlisted ones are reachable only by code. */
export type MissionVisibility = 'public' | 'unlisted'

export type MissionLog = {
  id: string
  ownerId: string
  /** ABC-123. Null when you're browsing someone else's mission: the code is the invite to join. */
  code: string | null
  name: string
  commander: string // the author's username
  target: string
  lat: number
  lon: number
  date: string // YYYY-MM-DD, may be empty
  objective: string
  status: MissionStatus
  visibility: MissionVisibility
  crewCount: number
  completedAt?: string
  createdAt: string
  updatedAt?: string
}

export type CrewMember = { userId: string; username: string; joinedAt: string }

export type MissionFields = Pick<MissionLog, 'name' | 'target' | 'lat' | 'lon' | 'date' | 'objective' | 'visibility'> & { code: string }

/** Three capital letters, a dash, three digits. */
export const MISSION_CODE_PATTERN = /^[A-Z]{3}-\d{3}$/

// Rows come either from the table (author and crew count embedded) or from the database functions
// (username and crew_count as plain columns).
type Row = {
  id: string
  owner_id: string
  code?: string | null
  name: string
  target: string
  lat: number
  lon: number
  date: string | null
  objective: string
  status: MissionStatus
  visibility: MissionVisibility
  completed_at: string | null
  created_at: string
  updated_at: string | null
  username?: string
  crew_count?: number
  author?: { username: string } | null
  crew?: { count: number }[]
}

// `profiles!owner_id` picks the author: missions also reach profiles through the crew table,
// so the relationship has to be named.
const COLUMNS =
  'id, owner_id, code, name, target, lat, lon, date, objective, status, visibility, completed_at, created_at, updated_at, author:profiles!owner_id(username), crew:mission_members(count)'

function fromRow(r: Row): MissionLog {
  return {
    id: r.id,
    ownerId: r.owner_id,
    code: r.code ?? null,
    name: r.name,
    commander: r.username ?? r.author?.username ?? 'unknown',
    target: r.target,
    lat: r.lat,
    lon: r.lon,
    date: r.date ?? '',
    objective: r.objective,
    status: r.status,
    visibility: r.visibility,
    crewCount: r.crew_count ?? r.crew?.[0]?.count ?? 0,
    completedAt: r.completed_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
  }
}

function toRow(f: MissionFields) {
  const code = f.code.trim().toUpperCase()
  const name = f.name.trim()
  const target = f.target.trim()
  if (!MISSION_CODE_PATTERN.test(code)) throw new Error('Mission code must look like ABC-123')
  if (!name) throw new Error('Mission name is required')
  if (name.length > 80) throw new Error('Mission name must be 80 characters or fewer')
  if (!target || target.length > 80) throw new Error('Target must be 1–80 characters')
  if (f.objective.length > 500) throw new Error('Objective must be 500 characters or fewer')
  return {
    code,
    name,
    target,
    lat: Math.round(f.lat * 100) / 100,
    lon: Math.round(f.lon * 100) / 100,
    date: f.date || null,
    objective: f.objective.trim(),
    visibility: f.visibility,
  }
}

function fail(error: { message: string; code?: string }): never {
  // A cancelled request (page moved on) isn't a failure; keep it recognisable as an AbortError
  if (error.message.includes('AbortError')) throw new DOMException('Request cancelled', 'AbortError')
  console.error('[missions]', error)
  if (error.code === '23505') throw new Error('That mission code was just taken. Pick another one.')
  // Function or column missing: the database is older than this version of the app
  if (error.code === 'PGRST202' || error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST200') {
    throw new Error('The mission database needs updating. Run supabase/schema.sql again in the Supabase SQL Editor.')
  }
  if (error.code === '42501') throw new Error('You need to be signed in to do that.')
  if (error.message.toLowerCase().includes('failed to fetch')) throw new Error('Could not reach Supabase. Check your connection.')
  // Messages raised by the database functions (e.g. "No mission has that code") are already readable
  throw new Error(error.message)
}

type Query<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }> & { abortSignal: (s: AbortSignal) => Query<T> }

async function run<T>(query: Query<T>, signal?: AbortSignal): Promise<T> {
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) fail(error)
  return data as T
}

/* ---------- Reading ---------- */

/** Opens a mission by its code (any visibility). Resolves to null when no mission has that code. */
export async function fetchMissionByCode(code: string, signal?: AbortSignal): Promise<MissionLog | null> {
  const rows = await run<Row[]>(supabase.rpc('get_mission_by_code', { p_code: code }) as unknown as Query<Row[]>, signal)
  return rows[0] ? fromRow(rows[0]) : null
}

/** Opens a mission from the browse list. Null when it doesn't exist or isn't visible to you. */
export async function fetchMissionById(id: string, signal?: AbortSignal): Promise<MissionLog | null> {
  const rows = await run<Row[]>(supabase.rpc('get_mission', { p_id: id }) as unknown as Query<Row[]>, signal)
  return rows[0] ? fromRow(rows[0]) : null
}

/** Public open missions, or all completed missions. Codes are never included. */
export async function browseMissions(status: MissionStatus, signal?: AbortSignal): Promise<MissionLog[]> {
  const rows = await run<Row[]>(supabase.rpc('browse_missions', { p_status: status }) as unknown as Query<Row[]>, signal)
  return rows.map(fromRow)
}

/** Missions you lead, newest first. */
export async function fetchMyMissions(userId: string, signal?: AbortSignal): Promise<MissionLog[]> {
  const rows = await run<Row[]>(
    supabase.from('mission_logs').select(COLUMNS).eq('owner_id', userId).order('created_at', { ascending: false }) as unknown as Query<Row[]>,
    signal,
  )
  return rows.map(fromRow)
}

/** Missions you've joined as crew, most recently joined first. */
export async function fetchJoinedMissions(userId: string, signal?: AbortSignal): Promise<MissionLog[]> {
  const rows = await run<{ mission: Row | null }[]>(
    supabase.from('mission_members').select(`mission:mission_logs(${COLUMNS})`).eq('user_id', userId).order('joined_at', { ascending: false }) as unknown as Query<{ mission: Row | null }[]>,
    signal,
  )
  return rows.flatMap((r) => (r.mission ? [fromRow(r.mission)] : []))
}

/** Everyone who joined a mission. Pass the code when you reached an unlisted mission through it. */
export async function fetchCrew(missionId: string, code?: string | null, signal?: AbortSignal): Promise<CrewMember[]> {
  const rows = await run<{ user_id: string; username: string; joined_at: string }[]>(
    supabase.rpc('get_mission_crew', { p_mission: missionId, p_code: code ?? null }) as unknown as Query<{ user_id: string; username: string; joined_at: string }[]>,
    signal,
  )
  return rows.map((r) => ({ userId: r.user_id, username: r.username, joinedAt: r.joined_at }))
}

/* ---------- Crew ---------- */

/** Joins an open mission using its code. Resolves to the mission id. */
export async function joinMission(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_mission', { p_code: code })
  if (error) fail(error)
  return data as string
}

/** Leave a mission yourself, or (as its author) remove someone from the crew. */
export async function removeCrewMember(missionId: string, userId: string): Promise<void> {
  const { data, error } = await supabase.from('mission_members').delete().eq('mission_id', missionId).eq('user_id', userId).select('user_id')
  if (error) fail(error)
  if (!data?.length) throw new Error('Could not remove that crew member (they may have left already).')
}

/* ---------- Codes ---------- */

/** True when the code is well-formed and no other mission uses it. */
export async function isMissionCodeAvailable(code: string, excludeId?: string, signal?: AbortSignal): Promise<boolean> {
  return (
    (await run<boolean>(supabase.rpc('mission_code_available', { p_code: code, p_exclude: excludeId ?? null }) as unknown as Query<boolean>, signal)) === true
  )
}

export function randomMissionCode() {
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
  return `${letters}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
}

/** A random code that isn't in use yet. */
export async function suggestMissionCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomMissionCode()
    if (await isMissionCodeAvailable(code)) return code
  }
  throw new Error('Could not find a free code. Try typing one yourself.')
}

/* ---------- Writing (author or admin) ---------- */

export async function createMissionLog(fields: MissionFields): Promise<MissionLog> {
  const { data, error } = await supabase.from('mission_logs').insert(toRow(fields)).select(COLUMNS).single()
  if (error) fail(error)
  return fromRow(data as unknown as Row)
}

// Row Level Security silently skips rows you may not change, so an empty result means "not allowed"
export async function updateMissionLog(id: string, fields: MissionFields): Promise<MissionLog> {
  const { data, error } = await supabase.from('mission_logs').update(toRow(fields)).eq('id', id).select(COLUMNS)
  if (error) fail(error)
  if (!data?.length) throw new Error('You can only change your own missions (or it was already deleted).')
  return fromRow(data[0] as unknown as Row)
}

/** Marks a mission complete (visible to everyone) or open again. The database stamps the completion time. */
export async function setMissionStatus(id: string, status: MissionStatus): Promise<MissionLog> {
  const { data, error } = await supabase.from('mission_logs').update({ status }).eq('id', id).select(COLUMNS)
  if (error) fail(error)
  if (!data?.length) throw new Error('You can only change your own missions (or it was already deleted).')
  return fromRow(data[0] as unknown as Row)
}

export async function deleteMissionLog(id: string): Promise<void> {
  const { data, error } = await supabase.from('mission_logs').delete().eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('You can only delete your own missions (or it was already deleted).')
}
