import { useEffect, useState, type FormEvent } from 'react'
import { CodeInput } from '../../components/CodeInput'
import { formatCode, sanitizeCode } from '../../lib/missionCode'
import type { User } from '../../services/auth'
import { fetchMyMissions, type MissionLog } from '../../services/missionLogs'
import { go, missionPath } from './shared'

type Props = {
  user: User | null
  initialCode: string
  problem: string | null
  notice: string | null
  onDismissNotice: () => void
}

export function FindMission({ user, initialCode, problem, notice, onDismissNotice }: Props) {
  const [raw, setRaw] = useState(() => sanitizeCode(initialCode))
  const [mine, setMine] = useState<MissionLog[] | null>(null)
  const [mineError, setMineError] = useState<string | null>(null)

  // Signed-in users get their own missions listed, so they never lose a code.
  // Keyed on the id so a refreshed user object doesn't cancel and restart the request.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetchMyMissions(userId, controller.signal)
      .then(setMine)
      .catch((err: Error) => { if (err.name !== 'AbortError') setMineError(err.message) })
    return () => controller.abort()
  }, [userId])

  const open = (code: string) => {
    onDismissNotice()
    go(missionPath(code))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (raw.length === 6) open(formatCode(raw))
  }

  return (
    <main className="mission-center">
      {notice && <p className="notice" role="status">{notice}</p>}

      <form className="find-mission" onSubmit={submit}>
        <h1>Open a mission</h1>
        <p className="muted">Enter the mission code you were given.</p>
        <CodeInput
          value={raw}
          onChange={setRaw}
          onComplete={open}
          label="Mission code: three letters, then three numbers"
          autoFocus
          invalid={!!problem && raw === sanitizeCode(initialCode)}
          describedBy={problem ? 'find-problem' : undefined}
        />
        {problem && raw === sanitizeCode(initialCode) && <p className="form-error" id="find-problem" role="alert">{problem}</p>}
        <button className="button" type="submit" disabled={raw.length < 6}>Open mission</button>
      </form>

      <div className="or-divider"><span>or</span></div>

      <section className="new-mission-cta">
        {user ? (
          <a className="button-outline" href={missionPath('new')}>+ New mission</a>
        ) : (
          <>
            <a className="button-outline" href="#/account">+ New mission</a>
            <p className="muted">You'll need to sign in to create one.</p>
          </>
        )}
      </section>

      {user && (
        <section className="my-missions" aria-label="Your missions">
          <h2>Your missions</h2>
          {mineError && <p className="form-error">{mineError}</p>}
          {!mine && !mineError && <p className="muted">Loading…</p>}
          {mine?.length === 0 && <p className="muted">You haven't created any missions yet.</p>}
          {mine && mine.length > 0 && (
            <ul>
              {mine.map((m) => (
                <li key={m.id}>
                  <a href={missionPath(m.code)}>
                    <span className="mono-code">{m.code}</span>
                    <span className="my-mission-name">{m.name}</span>
                    <span className="muted">{m.target}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
