import { supabase } from '../lib/supabase'

export type MissionLog = {
  id: string
  ownerId: string
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

export type MissionFields = Pick<MissionLog, 'name' | 'target' | 'lat' | 'lon' | 'date' | 'objective'>

type Row = {
  id: string
  owner_id: string
  name: string
  target: string
  lat: number
  lon: number
  date: string | null
  objective: string
  created_at: string
  updated_at: string | null
  author: { username: string } | null
}

const COLUMNS = 'id, owner_id, name, target, lat, lon, date, objective, created_at, updated_at, author:profiles(username)'
const MAX_MISSIONS = 500

function fromRow(r: Row): MissionLog {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    commander: r.author?.username ?? 'unknown',
    target: r.target,
    lat: r.lat,
    lon: r.lon,
    date: r.date ?? '',
    objective: r.objective,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
  }
}

function toRow(f: MissionFields) {
  const name = f.name.trim()
  const target = f.target.trim()
  if (!name) throw new Error('Mission name is required')
  if (name.length > 80) throw new Error('Mission name must be 80 characters or fewer')
  if (!target || target.length > 80) throw new Error('Target must be 1–80 characters')
  if (f.objective.length > 500) throw new Error('Objective must be 500 characters or fewer')
  return {
    name,
    target,
    lat: Math.round(f.lat * 100) / 100,
    lon: Math.round(f.lon * 100) / 100,
    date: f.date || null,
    objective: f.objective.trim(),
  }
}

function fail(error: { message: string; code?: string }): never {
  if (error.code === '42501') throw new Error('You need to be signed in to do that.')
  if (error.message.toLowerCase().includes('failed to fetch')) throw new Error('Could not reach Supabase. Check your connection.')
  throw new Error(error.message)
}

export async function fetchMissionLogs(signal?: AbortSignal): Promise<MissionLog[]> {
  let query = supabase.from('mission_logs').select(COLUMNS).order('created_at', { ascending: false }).limit(MAX_MISSIONS)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) fail(error)
  return (data as unknown as Row[]).map(fromRow)
}

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

export async function deleteMissionLog(id: string): Promise<void> {
  const { data, error } = await supabase.from('mission_logs').delete().eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('You can only delete your own missions (or it was already deleted).')
}
