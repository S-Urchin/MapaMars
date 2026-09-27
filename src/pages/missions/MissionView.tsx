import { memo, useMemo, useState } from 'react'
import { MarsGlobe, type GlobeLayers, type GlobeMarker } from '../../components/MarsGlobe'
import { formatLat, formatLon } from '../../data/mars'
import { useNow } from '../../hooks/useNow'
import { deleteMissionLog, setMissionStatus, type MissionLog } from '../../services/missionLogs'
import { go, missionPath, timeAgo } from './shared'

const Globe = memo(MarsGlobe)
const LAYERS: GlobeLayers = { grid: true, sites: true, orbits: false, rotate: false }

type Props = {
  mission: MissionLog
  canManage: boolean
  onChanged: (m: MissionLog) => void
  onDeleted: (m: MissionLog) => void
}

export function MissionView({ mission, canManage, onChanged, onDeleted }: Props) {
  const now = useNow(30_000)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const complete = mission.status === 'complete'

  const markers = useMemo<GlobeMarker[]>(() => [{ id: mission.id, label: mission.name, lat: mission.lat, lon: mission.lon, variant: 'filled' }], [mission])
  const focus = useMemo(() => ({ lat: mission.lat, lon: mission.lon }), [mission.lat, mission.lon])

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(mission.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked: the code is on screen to copy by hand */ }
  }

  const toggleStatus = async () => {
    setUpdatingStatus(true)
    setError(null)
    try {
      onChanged(await setMissionStatus(mission.id, complete ? 'open' : 'complete'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    setError(null)
    try {
      await deleteMissionLog(mission.id)
      onDeleted(mission)
    } catch (err) {
      setError((err as Error).message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <main className="mission-view">
      <section className="mission-detail">
        <a className="back-link" href={missionPath()}>← Missions</a>

        <div className="code-badge">
          <span className="mono-code">{mission.code}</span>
          <span className={`status-badge is-${mission.status}`}>{complete ? 'Complete' : 'Open'}</span>
          <button type="button" className="link-button" onClick={copyCode}>{copied ? 'Copied' : 'Copy code'}</button>
        </div>

        <h1>{mission.name}</h1>
        <p className="muted">by <strong className="plain">{mission.commander}</strong></p>

        <dl className="kv">
          <dt>Target</dt><dd className="plain-dd">{mission.target}</dd>
          <dt>Latitude</dt><dd>{formatLat(mission.lat)}</dd>
          <dt>Longitude</dt><dd>{formatLon(mission.lon)}</dd>
          {mission.date && <><dt>Planned</dt><dd>{mission.date}</dd></>}
          <dt>Logged</dt><dd>{timeAgo(mission.createdAt, now)}</dd>
          {mission.completedAt && <><dt>Completed</dt><dd>{timeAgo(mission.completedAt, now)}</dd></>}
          {mission.updatedAt && <><dt>Edited</dt><dd>{timeAgo(mission.updatedAt, now)}</dd></>}
        </dl>

        {mission.objective && <p className="site-note">{mission.objective}</p>}

        {canManage && (
          <div className="detail-actions">
            {confirmDelete ? (
              <>
                <span>Delete this mission for everyone?</span>
                <div className="form-actions">
                  <button type="button" className="button" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
                  <button type="button" className="button-outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Keep</button>
                </div>
              </>
            ) : (
              <>
                <div className="status-action">
                  <button type="button" className="button" onClick={toggleStatus} disabled={updatingStatus}>
                    {updatingStatus ? 'Saving…' : complete ? 'Reopen mission' : 'Mark complete'}
                  </button>
                  <p className="muted">
                    {complete
                      ? 'Everyone can see this mission. Reopening makes it private again (code only).'
                      : 'Only people with the code can see this mission. Completing it makes it visible to everyone.'}
                  </p>
                </div>
                <div className="form-actions">
                  <button type="button" className="button-outline" onClick={() => go(missionPath(mission.code, 'edit'))}>Edit</button>
                  <button type="button" className="button-outline" onClick={() => setConfirmDelete(true)}>Delete</button>
                </div>
              </>
            )}
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="mission-globe">
        <div className="globe-frame">
          <Globe sites={markers} selectedId={mission.id} layers={LAYERS} focus={focus} />
          <p className="globe-hint">Drag to rotate · Scroll to zoom</p>
        </div>
      </section>
    </main>
  )
}
