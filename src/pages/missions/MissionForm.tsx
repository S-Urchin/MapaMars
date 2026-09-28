import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CodeInput } from '../../components/CodeInput'
import { MarsMap2D, type LatLon } from '../../components/MarsMap2D'
import { formatDistance, formatLat, formatLon } from '../../data/mars'
import { formatCode, sanitizeCode } from '../../lib/missionCode'
import { routeLegs, routeMarkers, type RouteStop } from '../../lib/route'
import type { User } from '../../services/auth'
import {
  createMissionLog,
  isMissionCodeAvailable,
  MAX_PHASES,
  suggestMissionCode,
  updateMissionLog,
  type MissionLog,
  type MissionVisibility,
} from '../../services/missionLogs'
import { presets } from './shared'

type Props = {
  user: User | null
  authLoading: boolean
  /** Present when editing an existing mission. */
  mission?: MissionLog
  onSaved: (m: MissionLog) => void
  onCancel: () => void
}

type CodeStatus = 'incomplete' | 'checking' | 'available' | 'taken' | 'error'
/** Which point a map click places: the start, a phase (by index), or the end. */
type Slot = 'start' | 'end' | number
type PointDraft = { name: string; lat: string; lon: string }

const emptyPoint = (): PointDraft => ({ name: '', lat: '', lon: '' })
const draftOf = (name: string, lat: number, lon: number): PointDraft => ({ name, lat: String(lat), lon: String(lon) })

function initialForm(m?: MissionLog) {
  return {
    name: m?.name ?? '',
    start: m ? draftOf(m.startName, m.startLat, m.startLon) : emptyPoint(),
    phases: m ? m.phases.map((p) => draftOf(p.name, p.lat, p.lon)) : ([] as PointDraft[]),
    end: m ? draftOf(m.target, m.lat, m.lon) : emptyPoint(),
    date: m?.date ?? '',
    objective: m?.objective ?? '',
    visibility: (m?.visibility ?? 'public') as MissionVisibility,
  }
}

type Form = ReturnType<typeof initialForm>

function parsePoint(d: PointDraft): LatLon | null {
  if (d.lat.trim() === '' || d.lon.trim() === '') return null
  const p = { lat: Number(d.lat), lon: Number(d.lon) }
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? p : null
}

const coordName = (p: LatLon) => `${formatLat(p.lat, 3)} ${formatLon(p.lon, 3)}`

/** The point with its display name, or null when its coordinates aren't set. */
function stopOf(d: PointDraft, fallback: string): RouteStop | null {
  const p = parsePoint(d)
  return p ? { ...p, name: d.name.trim() || fallback } : null
}

const slotLabel = (slot: Slot) => (slot === 'start' ? 'A · start' : slot === 'end' ? 'B · end' : `Phase ${slot + 1}`)

export function MissionForm({ user, authLoading, mission, onSaved, onCancel }: Props) {
  const editing = !!mission
  const [form, setForm] = useState(() => initialForm(mission))
  const [placing, setPlacing] = useState<Slot>(mission ? 'end' : 'start')
  const [raw, setRaw] = useState(() => sanitizeCode(mission?.code ?? ''))
  const [checked, setChecked] = useState<{ raw: string; status: CodeStatus } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [focus, setFocus] = useState<(LatLon & { span?: number }) | null>(null)

  const code = formatCode(raw)
  const keepsOwnCode = !!mission && code === mission.code

  // Check the code with Supabase shortly after the last keystroke
  useEffect(() => {
    if (raw.length < 6 || keepsOwnCode) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      isMissionCodeAvailable(code, mission?.id, controller.signal)
        .then((ok) => setChecked({ raw, status: ok ? 'available' : 'taken' }))
        .catch((err: Error) => { if (err.name !== 'AbortError') setChecked({ raw, status: 'error' }) })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [raw, code, keepsOwnCode, mission?.id])

  const codeStatus: CodeStatus = raw.length < 6 ? 'incomplete' : keepsOwnCode ? 'available' : checked?.raw === raw ? checked.status : 'checking'

  const start = useMemo(() => stopOf(form.start, 'Start'), [form.start])
  const end = useMemo(() => stopOf(form.end, 'End'), [form.end])
  const phases = useMemo(() => form.phases.map((p, i) => stopOf(p, `Phase ${i + 1}`)), [form.phases])
  const markers = useMemo(() => routeMarkers(start, phases, end), [start, phases, end])
  const phasesComplete = phases.every(Boolean)
  const route = start && end && phasesComplete ? routeLegs([start, ...(phases as RouteStop[]), end]) : null

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setFormError(null)
  }

  const draftAt = (slot: Slot) => (slot === 'start' ? form.start : slot === 'end' ? form.end : form.phases[slot])
  const setDraft = (slot: Slot, patch: Partial<PointDraft>) => {
    setForm((f) => {
      if (slot === 'start') return { ...f, start: { ...f.start, ...patch } }
      if (slot === 'end') return { ...f, end: { ...f.end, ...patch } }
      return { ...f, phases: f.phases.map((p, i) => (i === slot ? { ...p, ...patch } : p)) }
    })
    setFormError(null)
  }

  // Clicking the map places the selected point, then moves on to the next point that's still empty
  const pick = (p: LatLon) => {
    setDraft(placing, { lat: p.lat.toFixed(4), lon: p.lon.toFixed(4) })
    const order: Slot[] = ['start', ...form.phases.map((_, i) => i), 'end']
    const next = order.slice(order.indexOf(placing) + 1).find((slot) => !parsePoint(draftAt(slot)))
    if (next !== undefined) setPlacing(next)
  }

  const addPhase = () => {
    if (form.phases.length >= MAX_PHASES) return
    set({ phases: [...form.phases, emptyPoint()] })
    setPlacing(form.phases.length)
  }

  const removePhase = (i: number) => {
    set({ phases: form.phases.filter((_, j) => j !== i) })
    if (placing === i) setPlacing('end')
    else if (typeof placing === 'number' && placing > i) setPlacing(placing - 1)
  }

  const movePhase = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= form.phases.length) return
    const next = [...form.phases]
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ phases: next })
    if (placing === i) setPlacing(j)
    else if (placing === j) setPlacing(i)
  }

  const jumpTo = (value: string) => {
    const p = presets.find((x) => x.value === value)
    if (p) setFocus({ lat: p.lat, lon: p.lon, span: 2 })
  }

  const suggest = async () => {
    setSuggesting(true)
    setFormError(null)
    try {
      const next = sanitizeCode(await suggestMissionCode())
      setRaw(next)
      setChecked({ raw: next, status: 'available' })
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (codeStatus !== 'available') { setFormError('Choose an available mission code first.'); return }
    if (!start) { setFormError('Set a start point: click the map or type its latitude and longitude.'); return }
    const missingPhase = phases.findIndex((p) => !p)
    if (missingPhase >= 0) { setFormError(`Set phase ${missingPhase + 1}’s location, or remove it.`); return }
    if (!end) { setFormError('Set an end point: click the map or type its latitude and longitude.'); return }
    setSaving(true)
    setFormError(null)
    const fields = {
      code,
      name: form.name,
      startName: form.start.name.trim() || coordName(start),
      startLat: start.lat,
      startLon: start.lon,
      phases: (phases as RouteStop[]).map((p) => ({ name: p.name, lat: p.lat, lon: p.lon })),
      target: form.end.name.trim() || coordName(end),
      lat: end.lat,
      lon: end.lon,
      date: form.date,
      objective: form.objective,
      visibility: form.visibility,
    }
    try {
      onSaved(mission ? await updateMissionLog(mission.id, fields) : await createMissionLog(fields))
    } catch (err) {
      setFormError((err as Error).message)
      setSaving(false)
    }
  }

  const statusText: Record<CodeStatus, string> = {
    incomplete: 'Three letters, then three numbers.',
    checking: 'Checking if this code is free…',
    available: keepsOwnCode ? 'This is the mission’s current code.' : `${code} is available.`,
    taken: `${code} is already taken. Try another one.`,
    error: 'Could not check this code right now.',
  }

  const pointFields = (slot: Slot) => {
    const draft = draftAt(slot)
    const isPhase = typeof slot === 'number'
    const badge = slot === 'start' ? 'A' : slot === 'end' ? 'B' : String(slot + 1)
    const title = slot === 'start' ? 'Start point' : slot === 'end' ? 'End point' : `Phase ${slot + 1}`
    const placeholder = slot === 'start' ? 'e.g. Habitat' : slot === 'end' ? 'e.g. Delta outcrop' : 'e.g. Crater rim sample stop'
    return (
      <fieldset key={String(slot)} className={`point-field${placing === slot ? ' is-placing' : ''}`}>
        <legend>
          <span className={`point-letter is-${isPhase ? 'phase' : slot}`}>{badge}</span>
          {title}
        </legend>
        {isPhase && (
          <div className="phase-controls span-2">
            <button type="button" className="link-button" onClick={() => setPlacing(slot)} disabled={placing === slot}>
              {placing === slot ? 'Placing on map' : 'Place on map'}
            </button>
            <button type="button" className="icon-btn" onClick={() => movePhase(slot, -1)} disabled={slot === 0} aria-label={`Move phase ${slot + 1} earlier`}>↑</button>
            <button type="button" className="icon-btn" onClick={() => movePhase(slot, 1)} disabled={slot === form.phases.length - 1} aria-label={`Move phase ${slot + 1} later`}>↓</button>
            <button type="button" className="icon-btn" onClick={() => removePhase(slot)} aria-label={`Remove phase ${slot + 1}`}>✕</button>
          </div>
        )}
        <label className="span-2">
          <span>{isPhase ? 'Phase name' : 'Place name'} <em className="muted">optional</em></span>
          <input value={draft.name} onChange={(e) => setDraft(slot, { name: e.target.value })} maxLength={80} placeholder={placeholder} />
        </label>
        <label>
          <span>Latitude</span>
          <input value={draft.lat} onChange={(e) => setDraft(slot, { lat: e.target.value })} inputMode="decimal" placeholder="-90 to 90" />
        </label>
        <label>
          <span>Longitude (east)</span>
          <input value={draft.lon} onChange={(e) => setDraft(slot, { lon: e.target.value })} inputMode="decimal" placeholder="-180 to 180" />
        </label>
      </fieldset>
    )
  }

  const slots: Slot[] = ['start', ...form.phases.map((_, i) => i), 'end']

  return (
    <main className="missions-page">
      <section className="mission-form-wrap">
        <h1>{editing ? 'Edit Marswalk' : 'New Marswalk'}</h1>
        <p className="muted">
          {editing ? 'Change the details and save. Anyone with the code sees the update.' : 'Choose a code (it’s the invite people use to join your crew), then set where the walk starts and ends.'}
        </p>

        {authLoading ? null : !user ? (
          <div className="signin-prompt">
            <p>Sign in to plan a Marswalk. You can edit or delete it later.</p>
            <a className="button" href="#/account">Sign in or create an account</a>
          </div>
        ) : (
          <form className="mission-form" onSubmit={submit} noValidate>
            <div className="code-field">
              <span className="field-label">Mission code</span>
              <CodeInput
                value={raw}
                onChange={(next) => { setRaw(next); setFormError(null) }}
                label="Mission code: three letters, then three numbers"
                autoFocus={!editing}
                invalid={codeStatus === 'taken'}
                describedBy="code-status"
              />
              <p id="code-status" className={`code-status is-${codeStatus}`} aria-live="polite">
                {codeStatus === 'available' && <span aria-hidden="true">✓ </span>}
                {statusText[codeStatus]}
              </p>
              <button type="button" className="link-button" onClick={suggest} disabled={suggesting}>
                {suggesting ? 'Finding a free code…' : 'Suggest a random code'}
              </button>
            </div>

            <label>
              <span>Mission name</span>
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} required placeholder="e.g. Delta Survey I" />
            </label>

            {pointFields('start')}

            <section className="phases" aria-label="Phases">
              <div className="phases-head">
                <span>Phases <em className="muted">optional</em></span>
                <span className="muted">{form.phases.length}/{MAX_PHASES}</span>
              </div>
              {form.phases.length === 0 && <p className="muted phases-hint">Add stops between the start and end, in the order you’ll walk them.</p>}
              {form.phases.map((_, i) => pointFields(i))}
              <button type="button" className="button-outline add-phase" onClick={addPhase} disabled={form.phases.length >= MAX_PHASES}>
                + Add phase
              </button>
            </section>

            {pointFields('end')}

            <div className="route-summary" aria-live="polite">
              {route ? (
                <>
                  <p>Straight-line distance: <strong className="plain">{formatDistance(route.totalKm)}</strong> <span className="muted">(derived; terrain not included yet)</span></p>
                  {route.legs.length > 1 && (
                    <ol className="legs">
                      {route.legs.map((leg, i) => <li key={i}><span>{leg.from} → {leg.to}</span><span className="mono-count">{formatDistance(leg.km)}</span></li>)}
                    </ol>
                  )}
                </>
              ) : (
                <p className="muted">Set every point to see the distance.</p>
              )}
            </div>

            <label>
              <span>Planned date <em className="muted">optional</em></span>
              <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label>
              <span>Objective <em className="muted">optional</em></span>
              <textarea value={form.objective} onChange={(e) => set({ objective: e.target.value })} maxLength={500} rows={3} placeholder="What will this Marswalk do?" />
            </label>
            <fieldset className="visibility-field">
              <legend>Who can find it</legend>
              {([
                ['public', 'Public', 'Anyone can see it and its crew when browsing. Joining still needs the code.'],
                ['unlisted', 'Unlisted', 'Only people with the code can open it, until it’s completed.'],
              ] as const).map(([value, label, hint]) => (
                <label key={value} className="radio-option">
                  <input type="radio" name="visibility" value={value} checked={form.visibility === value} onChange={() => set({ visibility: value })} />
                  <span><span className="plain">{label}</span><span className="muted">{hint}</span></span>
                </label>
              ))}
            </fieldset>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="form-actions">
              <button className="button" type="submit" disabled={saving || !form.name.trim() || codeStatus !== 'available' || !route}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create Marswalk'}
              </button>
              <button type="button" className="button-outline" onClick={onCancel}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section className="mission-map">
        {user && (
          <div className="map-toolbar">
            <div className="toggles" role="radiogroup" aria-label="Point to place on the map">
              {slots.map((slot) => (
                <button key={String(slot)} type="button" role="radio" aria-checked={placing === slot} className={placing === slot ? 'is-on' : ''} onClick={() => setPlacing(slot)}>
                  {slot === 'start' ? 'A' : slot === 'end' ? 'B' : slot + 1}
                  <span className="visually-hidden"> {slotLabel(slot)}</span>
                </button>
              ))}
            </div>
            <label className="jump-to">
              <span className="visually-hidden">Jump to a place</span>
              <select defaultValue="" onChange={(e) => { jumpTo(e.target.value); e.target.value = '' }}>
                <option value="" disabled>Jump to…</option>
                {['Landmarks', 'Landing sites'].map((group) => (
                  <optgroup key={group} label={group}>
                    {presets.filter((p) => p.group === group).map((p) => <option key={p.value} value={p.value}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
        )}
        <MarsMap2D points={markers} onPick={user ? pick : undefined} focus={focus} label="Marswalk planning map" />
        {user && <p className="muted map-hint">Click the map to place <strong className="plain">{slotLabel(placing)}</strong>. Drag to pan, scroll to zoom.</p>}
      </section>
    </main>
  )
}
