import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNow } from '../../hooks/useNow'
import { addMissionEntry, ENTRY_MAX_LENGTH, fetchMissionEntries, type MissionEntry } from '../../services/missionEntries'
import { timeAgo } from './shared'

const REFRESH_MS = 15_000

type Props = {
  missionId: string
  /** Code the viewer reached the mission with, needed to read unlisted missions' logs. */
  knownCode: string | null
  /** Lead or crew member. */
  isParticipant: boolean
  missionOpen: boolean
  signedIn: boolean
}

export function MissionLogPanel({ missionId, knownCode, isParticipant, missionOpen, signedIn }: Props) {
  const now = useNow(30_000)
  const [entries, setEntries] = useState<MissionEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const listRef = useRef<HTMLOListElement>(null)

  // Load the log, and keep checking for crewmates' new entries while the page is open
  useEffect(() => {
    let controller = new AbortController()
    const load = () => {
      controller.abort()
      controller = new AbortController()
      fetchMissionEntries(missionId, knownCode, controller.signal)
        .then((list) => { setEntries(list); setLoadError(null) })
        .catch((err: Error) => { if (err.name !== 'AbortError') setLoadError(err.message) })
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { clearInterval(timer); controller.abort() }
  }, [missionId, knownCode, version])

  // Keep the newest entry in view
  const count = entries?.length ?? 0
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [count])

  const canPost = signedIn && isParticipant && missionOpen

  const post = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!draft.trim() || posting) return
    setPosting(true)
    setPostError(null)
    try {
      await addMissionEntry(missionId, draft)
      setDraft('')
      setVersion((v) => v + 1)
    } catch (err) {
      setPostError((err as Error).message)
    } finally {
      setPosting(false)
    }
  }

  // Ctrl+Enter (or Cmd+Enter) pushes the entry
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post()
  }

  return (
    <section className="mission-log-panel" aria-label="Mission log">
      <h2>Mission log <span className="muted">{count}</span></h2>

      {loadError && <p className="form-error">{loadError}</p>}
      {!entries && !loadError && <p className="muted">Loading…</p>}
      {entries?.length === 0 && <p className="muted">No entries yet.{canPost ? ' Write the first one below.' : ''}</p>}
      {entries && entries.length > 0 && (
        <ol className="log-entries" ref={listRef}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="log-entry-head">
                <span className="plain">{entry.username}</span>
                <time className="muted" dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>
                  {timeAgo(entry.createdAt, now)}
                </time>
              </div>
              <p className="log-entry-body">{entry.body}</p>
            </li>
          ))}
        </ol>
      )}

      {canPost ? (
        <form className="log-compose" onSubmit={post}>
          <label className="visually-hidden" htmlFor="log-draft">New log entry</label>
          <textarea
            id="log-draft"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setPostError(null) }}
            onKeyDown={onKeyDown}
            maxLength={ENTRY_MAX_LENGTH}
            rows={3}
            placeholder="Write a log entry…"
            aria-describedby="log-permanent"
          />
          <div className="log-compose-foot">
            <span id="log-permanent" className="muted">Entries can’t be edited or deleted once pushed.</span>
            <span className="muted mono-count">{draft.length}/{ENTRY_MAX_LENGTH}</span>
          </div>
          {postError && <p className="form-error" role="alert">{postError}</p>}
          <button type="submit" className="button" disabled={posting || !draft.trim()}>
            {posting ? 'Pushing…' : 'Push to log'}
          </button>
        </form>
      ) : (
        <p className="muted log-closed">
          {!missionOpen
            ? 'This mission is complete, so its log is closed.'
            : !signedIn
              ? 'Sign in and join the crew to write in this log.'
              : 'Only the mission lead and crew can write in this log. Join with the mission code to take part.'}
        </p>
      )}
    </section>
  )
}
