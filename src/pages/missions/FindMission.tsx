import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CodeInput } from '../../components/CodeInput'
import { formatCode, sanitizeCode } from '../../lib/missionCode'
import type { User } from '../../services/auth'
import { browseMissions, fetchJoinedMissions, fetchMyMissions, type MissionLog, type MissionStatus } from '../../services/missionLogs'
import { go, missionIdPath, missionPath } from './shared'

type Props = {
  user: User | null
  initialCode: string
  problem: string | null
  notice: string | null
  onDismissNotice: () => void
}

type Loaded = { list: MissionLog[] | null; error: string | null }

/** Loads a list whenever `key` changes (null = don't load). */
function useMissionList(key: string | null, load: (signal: AbortSignal) => Promise<MissionLog[]>): Loaded {
  const [state, setState] = useState<Loaded & { key: string | null }>({ key: null, list: null, error: null })
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    loadRef.current(controller.signal)
      .then((list) => setState({ key, list, error: null }))
      .catch((err: Error) => { if (err.name !== 'AbortError') setState({ key, list: null, error: err.message }) })
    return () => controller.abort()
  }, [key])
  return state.key === key ? state : { list: null, error: null }
}

export function FindMission({ user, initialCode, problem, notice, onDismissNotice }: Props) {
  const [raw, setRaw] = useState(() => sanitizeCode(initialCode))
  const [tab, setTab] = useState<MissionStatus>('open')
  const userId = user?.id ?? null

  const browse = useMissionList(`browse:${tab}`, (signal) => browseMissions(tab, signal))
  const mine = useMissionList(userId && `mine:${userId}`, (signal) => fetchMyMissions(userId!, signal))
  const joined = useMissionList(userId && `joined:${userId}`, (signal) => fetchJoinedMissions(userId!, signal))

  const open = (code: string) => {
    onDismissNotice()
    go(missionPath(code))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (raw.length === 6) open(formatCode(raw))
  }

  const showProblem = !!problem && raw === sanitizeCode(initialCode)

  return (
    <main className="mission-center">
      {notice && <p className="notice" role="status">{notice}</p>}

      <form className="find-mission" onSubmit={submit}>
        <h1>Missions</h1>
        <p className="muted">Have a code? Enter it to open a mission or join its crew.</p>
        <CodeInput
          value={raw}
          onChange={setRaw}
          onComplete={open}
          label="Mission code: three letters, then three numbers"
          autoFocus
          invalid={showProblem}
          describedBy={showProblem ? 'find-problem' : undefined}
        />
        {showProblem && <p className="form-error" id="find-problem" role="alert">{problem}</p>}
        <button className="button" type="submit" disabled={raw.length < 6}>Open mission</button>
      </form>

      <section className="new-mission-cta">
        {user ? (
          <a className="button-outline" href={missionPath('new')}>+ New mission</a>
        ) : (
          <>
            <a className="button-outline" href="#/account">+ New mission</a>
            <p className="muted">You'll need to sign in to create or join one.</p>
          </>
        )}
      </section>

      {user && (
        <>
          <MissionList
            title="Missions you lead"
            state={mine}
            empty="You haven't created any missions yet."
            href={(m) => (m.code ? missionPath(m.code) : missionIdPath(m.id))}
            showCode
            showStatus
          />
          <MissionList
            title="Missions you've joined"
            state={joined}
            empty="You haven't joined any missions yet. Ask a mission's lead for its code."
            href={(m) => (m.code ? missionPath(m.code) : missionIdPath(m.id))}
            showCode
            showStatus
            showAuthor
          />
        </>
      )}

      <section className="browse" aria-label="Browse missions">
        <div className="browse-head">
          <h2>Browse</h2>
          <div className="toggles" role="tablist" aria-label="Mission status">
            {(['open', 'complete'] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={tab === s} className={tab === s ? 'is-on' : ''} onClick={() => setTab(s)}>
                {s === 'open' ? 'Open' : 'Completed'}
              </button>
            ))}
          </div>
        </div>
        <p className="muted browse-note">
          {tab === 'open'
            ? 'Public missions that are still recruiting. You need a mission’s code to join its crew.'
            : 'Finished missions, visible to everyone.'}
        </p>
        <MissionList
          state={browse}
          empty={tab === 'open' ? 'No public open missions right now.' : 'No completed missions yet.'}
          href={(m) => missionIdPath(m.id)}
          showAuthor
        />
      </section>
    </main>
  )
}

type ListProps = {
  title?: string
  state: Loaded
  empty: string
  href: (m: MissionLog) => string
  showCode?: boolean
  showStatus?: boolean
  showAuthor?: boolean
}

function MissionList({ title, state, empty, href, showCode, showStatus, showAuthor }: ListProps) {
  const { list, error } = state
  return (
    <section className="my-missions" aria-label={title}>
      {title && <h2>{title}</h2>}
      {error && <p className="form-error">{error}</p>}
      {!list && !error && <p className="muted">Loading…</p>}
      {list?.length === 0 && <p className="muted">{empty}</p>}
      {list && list.length > 0 && (
        <ul>
          {list.map((m) => (
            <li key={m.id}>
              <a href={href(m)} className={showCode && m.code ? '' : 'no-code'}>
                {showCode && m.code && <span className="mono-code">{m.code}</span>}
                <span className="my-mission-name">
                  {m.name}
                  {showStatus && <span className={`status-badge is-${m.status}`}>{m.status === 'complete' ? 'Complete' : 'Open'}</span>}
                  {showStatus && m.visibility === 'unlisted' && <span className="status-badge is-open">Unlisted</span>}
                </span>
                <span className="muted">
                  {[`${m.startName} → ${m.target}`, showAuthor && `led by ${m.commander}`, `${m.crewCount + 1} crew`].filter(Boolean).join(' · ')}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
