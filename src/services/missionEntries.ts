import { supabase } from '../lib/supabase'

/** One entry in a mission's log. Entries can't be edited once posted. */
export type MissionEntry = { id: number; authorId: string; username: string; body: string; createdAt: string }

export const ENTRY_MAX_LENGTH = 1000

function fail(error: { message: string; code?: string }): never {
  if (error.message.includes('AbortError')) throw new DOMException('Request cancelled', 'AbortError')
  console.error('[mission log]', error)
  if (error.code === 'PGRST202') throw new Error('The mission database needs updating. Run supabase/schema.sql again in the Supabase SQL Editor.')
  if (error.message.toLowerCase().includes('failed to fetch')) throw new Error('Could not reach Supabase. Check your connection.')
  // Messages raised by the database (e.g. "Only the mission lead and crew can write in its log") are readable as-is
  throw new Error(error.message)
}

/** A mission's log, oldest first. Pass the code when you reached an unlisted mission through it. */
export async function fetchMissionEntries(missionId: string, code?: string | null, signal?: AbortSignal): Promise<MissionEntry[]> {
  let query = supabase.rpc('get_mission_entries', { p_mission: missionId, p_code: code ?? null })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) fail(error)
  return (data as { id: number; author_id: string; username: string; body: string; created_at: string }[]).map((r) => ({
    id: r.id,
    authorId: r.author_id,
    username: r.username,
    body: r.body,
    createdAt: r.created_at,
  }))
}

/** Adds an entry to the log. Only the lead and crew can, and only while the mission is open. */
export async function addMissionEntry(missionId: string, body: string): Promise<void> {
  const text = body.trim()
  if (!text) throw new Error('Write something first')
  if (text.length > ENTRY_MAX_LENGTH) throw new Error(`Entries can be up to ${ENTRY_MAX_LENGTH} characters`)
  const { error } = await supabase.rpc('add_mission_entry', { p_mission: missionId, p_body: text })
  if (error) fail(error)
}
