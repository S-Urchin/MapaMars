import { memo, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { MarsGlobe, type GlobeLayers, type GlobeMarker } from '../components/MarsGlobe'
import { formatLat, formatLon, landingSites, landmarks } from '../data/mars'
import { useNow } from '../hooks/useNow'
import { createMissionLog, deleteMissionLog, fetchMissionLogs, updateMissionLog, type MissionLog } from '../services/missionLogs'

const Globe = memo(MarsGlobe)
const LAYERS: GlobeLayers = { grid: true, sites: true, orbits: false, rotate: false }
const REFRESH_MS = 15_000
const DRAFT_ID = '__draft__'
const CUSTOM = 'custom'

const presets = [
  ...landmarks.map((l) => ({ value: `lm:${l.name}`, name: l.name, lat: l.lat, lon: l.lon })),
  ...landingSites.map((s) => ({ value: `ls:${s.id}`, name: `${s.location} (${s.mission})`, lat: s.lat, lon: s.lon })),
]

const emptyForm = { name: '', preset: presets[0].value, target: '', lat: '', lon: '', date: '', objective: '' }

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function timeAgo(iso: string, now: Date) {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  return 'just now'
}

export function MissionsPage() {
  const { user, loading: authLoading } = useAuth()
  const now = useNow(30_000)
  const [missions, setMissions] = useState<MissionLog[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(() => ({ lat: presets[0].lat, lon: presets[0].lon }))
  const formRef = useRef<HTMLElement>(null)

  // Load the shared log and keep it fresh so other people's missions show up
  useEffect(() => {
    let controller = new AbortController()
    const load = () => {
      controller.abort()
      controller = new AbortController()
      fetchMissionLogs(controller.signal)
        .then((list) => { setMissions(list); setLoadState('ready') })
        .catch((err: unknown) => { if ((err as Error).name !== 'AbortError') setLoadState((s) => (s === 'ready' ? s : 'error')) })
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { clearInterval(id); controller.abort() }
  }, [])

  const canManage = (m: MissionLog) => !!user && (m.ownerId === user.id || user.isAdmin)

  // Leaving edit mode if the user signs out or the mission disappears
  const editing = editingId ? missions.find((m) => m.id === editingId && canManage(m)) : undefined
  const isEditing = !!editing

  const target = useMemo(() => {
    if (form.preset === CUSTOM) {
      const lat = Number(form.lat), lon = Number(form.lon)
      const valid = form.lat.trim() !== '' && form.lon.trim() !== '' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      return valid ? { name: form.target.trim(), lat, lon } : null
    }
    const p = presets.find((x) => x.value === form.preset)!
    return { name: p.name, lat: p.lat, lon: p.lon }
  }, [form.preset, form.target, form.lat, form.lon])

  const markers = useMemo<GlobeMarker[]>(() => {
    const list: GlobeMarker[] = missions
      .filter((m) => m.id !== editingId)
      .map((m) => ({ id: m.id, label: m.name, lat: m.lat, lon: m.lon, variant: user && m.ownerId === user.id ? 'filled' : undefined }))
    if (user && target) list.push({ id: DRAFT_ID, label: target.name || (isEditing ? form.name || 'Your target' : 'Your target'), lat: target.lat, lon: target.lon, variant: 'pin' })
    return list
  }, [missions, target, user, editingId, isEditing, form.name])

  const update = (field: keyof typeof emptyForm) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setFormError(null)
  }

  const pickOnGlobe = (lat: number, lon: number) => {
    if (!user) return
    setForm((f) => ({ ...f, preset: CUSTOM, lat: lat.toFixed(2), lon: lon.toFixed(2) }))
    setFormError(null)
  }

  const choosePreset = (value: string) => {
    setForm((f) => ({ ...f, preset: value }))
    const p = presets.find((x) => x.value === value)
    if (p) setFocus({ lat: p.lat, lon: p.lon })
    setFormError(null)
  }

  const startEdit = (m: MissionLog) => {
    setEditingId(m.id)
    setForm({ name: m.name, preset: CUSTOM, target: m.target, lat: String(m.lat), lon: String(m.lon), date: m.date, objective: m.objective })
    setFocus({ lat: m.lat, lon: m.lon })
    setFormError(null)
    setConfirmDeleteId(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target) { setFormError('Enter a latitude and longitude, or click the globe to pick a spot.'); return }
    setSaving(true)
    setFormError(null)
    const fields = {
      name: form.name,
      target: target.name || `${formatLat(target.lat)} ${formatLon(target.lon)}`,
      lat: target.lat,
      lon: target.lon,
      date: form.date,
      objective: form.objective,
    }
    try {
      if (editing) {
        const saved = await updateMissionLog(editing.id, fields)
        setMissions((list) => list.map((m) => (m.id === saved.id ? saved : m)))
        setSelectedId(saved.id)
      } else {
        const created = await createMissionLog(fields)
        setMissions((list) => [created, ...list.filter((m) => m.id !== created.id)])
        setSelectedId(created.id)
        setLoadState('ready')
      }
      setEditingId(null)
      setForm(emptyForm)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (m: MissionLog) => {
    setCardError(null)
    try {
      await deleteMissionLog(m.id)
      setMissions((list) => list.filter((x) => x.id !== m.id))
      if (editingId === m.id) cancelEdit()
      if (selectedId === m.id) setSelectedId(null)
    } catch (err) {
      setCardError({ id: m.id, message: (err as Error).message })
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <main className="missions-page">
      <section className="mission-form-wrap" ref={formRef}>
        <h1>{isEditing ? 'Edit mission' : 'Log a mission'}</h1>
        <p className="muted">
          {isEditing ? 'Change the details and save. Everyone will see the update.' : 'Plan your own mission to Mars. Everyone using this site can see the missions in the log.'}
        </p>

        {authLoading ? null : !user ? (
          <div className="signin-prompt">
            <p>Sign in to log a mission. You can edit or delete your missions later.</p>
            <a className="button" href="#/account">Sign in or create an account</a>
          </div>
        ) : (
          <form className="mission-form" onSubmit={submit} noValidate>
            <p className="as-user muted">{isEditing ? 'Editing as' : 'Logging as'} <strong className="plain">{user.username}</strong></p>
            <label>
              <span>Mission name</span>
              <input value={form.name} onChange={update('name')} maxLength={80} required placeholder="e.g. Red Dawn I" />
            </label>
            <label>
              <span>Target</span>
              <select value={form.preset} onChange={(e) => choosePreset(e.target.value)}>
                <optgroup label="Landmarks">
                  {presets.filter((p) => p.value.startsWith('lm:')).map((p) => <option key={p.value} value={p.value}>{p.name}</option>)}
                </optgroup>
                <optgroup label="Landing sites">
                  {presets.filter((p) => p.value.startsWith('ls:')).map((p) => <option key={p.value} value={p.value}>{p.name}</option>)}
                </optgroup>
                <option value={CUSTOM}>Custom coordinates…</option>
              </select>
            </label>
            {form.preset === CUSTOM && (
              <div className="custom-target">
                <label className="span-2">
                  <span>Place name <em className="muted">optional</em></span>
                  <input value={form.target} onChange={update('target')} maxLength={80} placeholder="e.g. Crater rim" />
                </label>
                <label>
                  <span>Latitude</span>
                  <input value={form.lat} onChange={update('lat')} inputMode="decimal" placeholder="-90 to 90" />
                </label>
                <label>
                  <span>Longitude (east)</span>
                  <input value={form.lon} onChange={update('lon')} inputMode="decimal" placeholder="-180 to 180" />
                </label>
              </div>
            )}
            <p className="hint muted">Tip: click anywhere on the globe to set custom coordinates.</p>
            <label>
              <span>Planned date <em className="muted">optional</em></span>
              <input type="date" value={form.date} onChange={update('date')} />
            </label>
            <label>
              <span>Objective <em className="muted">optional</em></span>
              <textarea value={form.objective} onChange={update('objective')} maxLength={500} rows={3} placeholder="What will this mission do?" />
            </label>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="form-actions">
              <button className="button" type="submit" disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Log mission'}
              </button>
              {isEditing && <button type="button" className="button-outline" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        )}
      </section>

      <section className="mission-globe">
        <div className="globe-frame">
          <Globe sites={markers} selectedId={selectedId} layers={LAYERS} onSelect={setSelectedId} onPick={pickOnGlobe} focus={focus} />
          <p className="globe-hint">{user ? 'Click to pick a target · Drag to rotate' : 'Drag to rotate · Scroll to zoom'}</p>
        </div>
      </section>

      <section className="mission-log" aria-live="polite">
        <div className="mission-log-head">
          <h2>Mission log</h2>
          <span className="muted">{missions.length} logged · updates every {REFRESH_MS / 1000}s</span>
        </div>
        {loadState === 'loading' && <p className="muted">Loading missions…</p>}
        {loadState === 'error' && <p className="form-error">Could not load the mission log. Check your connection and try again.</p>}
        {loadState === 'ready' && missions.length === 0 && <p className="muted">No missions yet. Be the first to log one.</p>}
        <ul>
          {missions.map((m) => (
            <li key={m.id}>
              <article className={`log-card${m.id === selectedId ? ' is-selected' : ''}${m.id === editingId ? ' is-editing' : ''}`}>
                <button type="button" className="log-card-main" onClick={() => setSelectedId(m.id)} aria-label={`Show ${m.name} on the globe`}>
                  <div className="log-card-top">
                    <h3>{m.name}</h3>
                    {user && m.ownerId === user.id && <span className="tag">Yours</span>}
                  </div>
                  <p className="log-meta">
                    <span>{m.commander}</span>
                    <span>{m.target}</span>
                    <span className="mono">{formatLat(m.lat)} {formatLon(m.lon)}</span>
                    {m.date && <span className="mono">{m.date}</span>}
                  </p>
                  {m.objective && <p className="log-objective">{m.objective}</p>}
                  <p className="log-time muted">
                    Logged {timeAgo(m.createdAt, now)}{m.updatedAt && ` · edited ${timeAgo(m.updatedAt, now)}`}
                  </p>
                </button>

                {canManage(m) && (
                  <div className="log-actions">
                    {confirmDeleteId === m.id ? (
                      <>
                        <span>Delete this mission?</span>
                        <button type="button" className="danger" onClick={() => remove(m)}>Delete</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)}>Keep</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(m)} disabled={m.id === editingId}>{m.id === editingId ? 'Editing…' : 'Edit'}</button>
                        <button type="button" onClick={() => setConfirmDeleteId(m.id)}>Delete</button>
                        {user && m.ownerId !== user.id && <span className="muted">admin</span>}
                      </>
                    )}
                  </div>
                )}
                {cardError?.id === m.id && <p className="form-error card-error" role="alert">{cardError.message}</p>}
              </article>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
