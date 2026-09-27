import { supabase } from '../lib/supabase'

export type MissionLog = {
  id: string
  ownerId: string
  code: string // ABC-123
  name: string
  commander: string // the author's username
  target: string
  lat: number
  lon: number
  date: string // YYYY-MM-DD, may be empty
  objective: string
  createdAt: string
  updatedAt?: string
}

export type MissionFields = Pick<MissionLog, 'code' | 'name' | 'target' | 'lat' | 'lon' | 'date' | 'objective'>

/** Three capital letters, a dash, three digits. */
export const MISSION_CODE_PATTERN = /^[A-Z]{3}-\d{3}$/

type Row = {
  id: string
  owner_id: string
  code: string
  name: string
  target: string
  lat: number
  lon: number
  date: string | null
  objective: string
  created_at: string
  updated_at: string | null
}

const COLUMNS = 'id, owner_id, code, name, target, lat, lon, date, objective, created_at, updated_at, author:profiles(username)'

function fromRow(r: Row, username: string | undefined): MissionLog {
  return {
    id: r.id,
    ownerId: r.owner_id,
    code: r.code,
    name: r.name,
    commander: username ?? 'unknown',
    target: r.target,
    lat: r.lat,
    lon: r.lon,
    date: r.date ?? '',
    objective: r.objective,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
  }
}

type RowWithAuthor = Row & { author: { username: string } | null }
const fromJoined = (r: RowWithAuthor) => fromRow(r, r.author?.username)

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
  }
}

function fail(error: { message: string; code?: string }): never {
  console.error('[missions]', error)
  if (error.code === '23505') throw new Error('That mission code was just taken. Pick another one.')
  // Function or column missing: the database is older than this version of the app
  if (error.code === 'PGRST202' || error.code === '42703' || error.code === 'PGRST204') {
    throw new Error('The mission database needs updating. Run supabase/schema.sql again in the Supabase SQL Editor.')
  }
  if (error.code === '42501') throw new Error('You need to be signed in to do that.')
  if (error.message.toLowerCase().includes('failed to fetch')) throw new Error('Could not reach Supabase. Check your connection.')
  throw new Error(error.message)
}

/** Opens a mission by its code. Resolves to null when no mission has that code. */
export async function fetchMissionByCode(code: string, signal?: AbortSignal): Promise<MissionLog | null> {
  let query = supabase.rpc('get_mission_by_code', { p_code: code })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) fail(error)
  const row = (data as (Row & { username: string })[])[0]
  return row ? fromRow(row, row.username) : null
}

/** Missions created by this user, newest first. */
export async function fetchMyMissions(userId: string, signal?: AbortSignal): Promise<MissionLog[]> {
  let query = supabase.from('mission_logs').select(COLUMNS).eq('owner_id', userId).order('created_at', { ascending: false })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) fail(error)
  return (data as unknown as RowWithAuthor[]).map(fromJoined)
}

/** True when the code is well-formed and no other mission uses it. */
export async function isMissionCodeAvailable(code: string, excludeId?: string, signal?: AbortSignal): Promise<boolean> {
  let query = supabase.rpc('mission_code_available', { p_code: code, p_exclude: excludeId ?? null })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) fail(error)
  return data === true
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

export async function createMissionLog(fields: MissionFields): Promise<MissionLog> {
  const { data, error } = await supabase.from('mission_logs').insert(toRow(fields)).select(COLUMNS).single()
  if (error) fail(error)
  return fromJoined(data as unknown as RowWithAuthor)
}

// Row Level Security silently skips rows you may not change, so an empty result means "not allowed"
export async function updateMissionLog(id: string, fields: MissionFields): Promise<MissionLog> {
  const { data, error } = await supabase.from('mission_logs').update(toRow(fields)).eq('id', id).select(COLUMNS)
  if (error) fail(error)
  if (!data?.length) throw new Error('You can only change your own missions (or it was already deleted).')
  return fromJoined(data[0] as unknown as RowWithAuthor)
}

export async function deleteMissionLog(id: string): Promise<void> {
  const { data, error } = await supabase.from('mission_logs').delete().eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('You can only delete your own missions (or it was already deleted).')
}
