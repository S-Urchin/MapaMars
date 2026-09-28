import { useEffect, useState } from 'react'
import { CodeInput } from '../../components/CodeInput'
import { MarsMap2D } from '../../components/MarsMap2D'
import { formatDistance, formatLat, formatLon } from '../../data/mars'
import { routeLegs, routeMarkers } from '../../lib/route'
import { useNow } from '../../hooks/useNow'
import { formatCode } from '../../lib/missionCode'
import type { User } from '../../services/auth'
import {
  deleteMissionLog,
  fetchCrew,
  fetchMissionById,
  joinMission,
  removeCrewMember,
  setMissionStatus,
  type CrewMember,
  type MissionLog,
} from '../../services/missionLogs'
import { MissionLogPanel } from './MissionLogPanel'
import { go, missionPath, timeAgo } from './shared'


type Props = {
  mission: MissionLog
  /** The code, when the viewer reached this mission through it (or is allowed to see it). */
  knownCode: string | null
  user: User | null
  canManage: boolean
  onChanged: (m: MissionLog) => void
  onDeleted: (m: MissionLog) => void
}

export function MissionView({ mission, knownCode, user, canManage, onChanged, onDeleted }: Props) {
  const now = useNow(30_000)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Which action is in progress: 'status', 'delete', 'join', or the user id being removed
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [crew, setCrew] = useState<CrewMember[] | null>(null)
  const [crewError, setCrewError] = useState<string | null>(null)
  const [crewVersion, setCrewVersion] = useState(0)
  const [joinRaw, setJoinRaw] = useState('')

  const complete = mission.status === 'complete'
  const isOwner = !!user && mission.ownerId === user.id
  const isMember = !!user && !!crew?.some((c) => c.userId === user.id)
  const code = mission.code ?? knownCode

  // Walking order: A (start) → phases → B (end)
  const start = { name: mission.startName, lat: mission.startLat, lon: mission.startLon }
  const end = { name: mission.target, lat: mission.lat, lon: mission.lon }
  const stops = [start, ...mission.phases, end]
  const markers = routeMarkers(start, mission.phases, end)
  const route = routeLegs(stops)

  useEffect(() => {
    const controller = new AbortController()
    fetchCrew(mission.id, knownCode, controller.signal)
      .then(setCrew)
      .catch((err: Error) => { if (err.name !== 'AbortError') setCrewError(err.message) })
    return () => controller.abort()
  }, [mission.id, knownCode, crewVersion])

  const act = async (kind: string, work: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // After joining or leaving, reload the mission (joining reveals its code) and the crew list
  const refresh = async () => {
    const fresh = await fetchMissionById(mission.id)
    // Leaving an unlisted mission you reached without its code means you can no longer see it
    if (!fresh && !knownCode) { go(missionPath()); return }
    if (fresh) onChanged({ ...fresh, code: fresh.code ?? knownCode })
    setCrewVersion((v) => v + 1)
  }

  const join = (withCode: string) => act('join', async () => {
    const joinedId = await joinMission(withCode)
    if (joinedId !== mission.id) throw new Error('That code belongs to a different mission.')
    setJoinRaw('')
    await refresh()
  })

  const removeMember = (memberId: string) => act(memberId, async () => {
    await removeCrewMember(mission.id, memberId)
    await refresh()
  })

  const toggleStatus = () => act('status', async () => {
    onChanged(await setMissionStatus(mission.id, complete ? 'open' : 'complete'))
  })

  const deleteMission = () => act('delete', async () => {
    await deleteMissionLog(mission.id)
    onDeleted(mission)
  })

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked: the code is on screen to copy by hand */ }
  }

  const joinArea = () => {
    if (!user) return complete ? null : <p className="muted">Have this mission’s code? <a href="#/account">Sign in</a> to join the crew.</p>
    if (isOwner) return <p className="muted">You lead this mission. Share its code to invite crew.</p>
    if (isMember) {
      return (
        <div className="form-actions">
          <span className="muted">You’re on this crew.</span>
          <button type="button" className="link-button" onClick={() => removeMember(user.id)} disabled={busy === user.id}>
            {busy === user.id ? 'Leaving…' : 'Leave mission'}
          </button>
        </div>
      )
    }
    if (complete) return <p className="muted">This mission is complete, so it can’t take new crew.</p>
    if (knownCode) {
      return (
        <button type="button" className="button" onClick={() => join(knownCode)} disabled={busy === 'join'}>
          {busy === 'join' ? 'Joining…' : 'Join this mission'}
        </button>
      )
    }
    return (
      <div className="join-with-code">
        <p className="muted">Enter the mission code to join the crew.</p>
        <CodeInput value={joinRaw} onChange={setJoinRaw} onComplete={join} label="Mission code to join: three letters, then three numbers" />
        <button type="button" className="button" onClick={() => join(formatCode(joinRaw))} disabled={joinRaw.length < 6 || busy === 'join'}>
          {busy === 'join' ? 'Joining…' : 'Join'}
        </button>
      </div>
    )
  }

  return (
    <main className="mission-view">
      <section className="mission-detail">
        <a className="back-link" href={missionPath()}>← Missions</a>

        <div className="code-badge">
          {code && <span className="mono-code">{code}</span>}
          <span className={`status-badge is-${mission.status}`}>{complete ? 'Complete' : 'Open'}</span>
          {mission.visibility === 'unlisted' && <span className="status-badge is-open">Unlisted</span>}
          {code && canManage && (
            <button type="button" className="link-button" onClick={copyCode}>{copied ? 'Copied' : 'Copy code'}</button>
          )}
        </div>

        <h1>{mission.name}</h1>
        <p className="muted">Led by <strong className="plain">{mission.commander}</strong></p>

        <dl className="kv">
          <dt>Distance</dt>
          <dd>{formatDistance(route.totalKm)} <span className="muted">straight line{mission.phases.length ? `, ${mission.phases.length} phase${mission.phases.length === 1 ? '' : 's'}` : ''}</span></dd>
          {mission.date && <><dt>Planned</dt><dd>{mission.date}</dd></>}
          <dt>Logged</dt><dd>{timeAgo(mission.createdAt, now)}</dd>
          {mission.completedAt && <><dt>Completed</dt><dd>{timeAgo(mission.completedAt, now)}</dd></>}
        </dl>

        <ol className="route-stops" aria-label="Route">
          {stops.map((stop, i) => {
            const badge = i === 0 ? 'A' : i === stops.length - 1 ? 'B' : String(i)
            const variant = i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'phase'
            return (
              <li key={i}>
                <span className={`point-letter is-${variant}`}>{badge}</span>
                <span className="route-stop-text">
                  <span className="plain">{stop.name}</span>
                  <span className="muted coord-line">{formatLat(stop.lat, 4)} {formatLon(stop.lon, 4)}</span>
                </span>
                {i > 0 && <span className="muted mono-count">+{formatDistance(route.legs[i - 1].km)}</span>}
              </li>
            )
          })}
        </ol>

        {mission.objective && <p className="site-note">{mission.objective}</p>}

        <section className="crew" aria-label="Crew">
          <h2>Crew <span className="muted">{(crew?.length ?? mission.crewCount) + 1}</span></h2>
          <ul>
            <li>
              <span className="plain">{mission.commander}</span>
              <span className="crew-role">Lead</span>
            </li>
            {crew?.map((c) => (
              <li key={c.userId}>
                <span className="plain">{c.username}</span>
                <span className="muted crew-joined">joined {timeAgo(c.joinedAt, now)}</span>
                {canManage && c.userId !== user?.id && (
                  <button type="button" className="link-button" onClick={() => removeMember(c.userId)} disabled={busy === c.userId}>
                    {busy === c.userId ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {crewError && <p className="form-error">{crewError}</p>}
          <div className="join-box">{joinArea()}</div>
        </section>

        <MissionLogPanel
          missionId={mission.id}
          knownCode={knownCode}
          isParticipant={isOwner || isMember}
          missionOpen={!complete}
          signedIn={!!user}
        />

        {canManage && (
          <div className="detail-actions">
            {confirmDelete ? (
              <>
                <span>Delete this mission and its crew list for everyone?</span>
                <div className="form-actions">
                  <button type="button" className="button" onClick={deleteMission} disabled={busy === 'delete'}>{busy === 'delete' ? 'Deleting…' : 'Delete'}</button>
                  <button type="button" className="button-outline" onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>Keep</button>
                </div>
              </>
            ) : (
              <>
                <div className="status-action">
                  <button type="button" className="button" onClick={toggleStatus} disabled={busy === 'status'}>
                    {busy === 'status' ? 'Saving…' : complete ? 'Reopen mission' : 'Mark complete'}
                  </button>
                  <p className="muted">
                    {complete
                      ? 'Everyone can see this mission. Reopening lets new crew join again.'
                      : 'Completing a mission makes it visible to everyone and closes it to new crew.'}
                  </p>
                </div>
                <div className="form-actions">
                  {code && <button type="button" className="button-outline" onClick={() => go(missionPath(code, 'edit'))}>Edit</button>}
                  <button type="button" className="button-outline" onClick={() => setConfirmDelete(true)}>Delete</button>
                </div>
              </>
            )}
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="mission-map">
        <MarsMap2D points={markers} label={`Route of ${mission.name}`} />
      </section>
    </main>
  )
}
