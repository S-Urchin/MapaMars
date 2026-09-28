import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CodeInput } from '../../components/CodeInput'
import { MarsMap2D, type LatLon } from '../../components/MarsMap2D'
import { formatDistance, formatLat, formatLon } from '../../data/mars'
import { formatCode, sanitizeCode } from '../../lib/missionCode'
import { routeLegs, routeMarkers, routeStops, type RouteStop } from '../../lib/route'
import type { User } from '../../services/auth'
import {
  createMissionLog,
  isMissionCodeAvailable,
  MAX_PHASES,
  suggestMissionCode,
  updateMissionLog,
  type MissionLog,
  type MissionVisibility,
  type TripType,
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
    tripType: (m?.tripType ?? 'linear') as TripType,
    // A round trip has no separate end point in the form
    end: m && m.tripType !== 'round' ? draftOf(m.target, m.lat, m.lon) : emptyPoint(),
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
  const [placing, setPlacing] = useState<Slot>(mission && mission.tripType !== 'round' ? 'end' : 'start')
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
  const round = form.tripType === 'round'
  const markers = useMemo(() => routeMarkers(start, phases, end, round), [start, phases, end, round])
  const phasesComplete = phases.every(Boolean)
  // A round trip ends back at A, so it needs no B but at least one phase to walk to
  const routeReady = !!start && phasesComplete && (round ? phases.length > 0 : !!end)
  const route = routeReady ? routeLegs(routeStops(start!, phases as RouteStop[], (end ?? start)!, round)) : null

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
    const order: Slot[] = ['start', ...form.phases.map((_, i) => i), ...(round ? [] : ['end' as const])]
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
    if (placing === i) setPlacing(round ? 'start' : 'end')
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
    if (round && phases.length === 0) { setFormError('A round trip needs at least one phase to walk to before coming back.'); return }
    if (!round && !end) { setFormError('Set an end point: click the map or type its latitude and longitude.'); return }
    setSaving(true)
    setFormError(null)
    const startName = form.start.name.trim() || coordName(start)
    // A round trip finishes at the start
    const finish = round || !end ? { ...start, name: startName } : { ...end, name: form.end.name.trim() || coordName(end) }
    const fields = {
      code,
      name: form.name,
      tripType: form.tripType,
      startName,
      startLat: start.lat,
      startLon: start.lon,
      phases: (phases as RouteStop[]).map((p) => ({ name: p.name, lat: p.lat, lon: p.lon })),
      target: finish.name,
      lat: finish.lat,
      lon: finish.lon,
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
    const isPlacing = placing === slot
    const placed = !!parsePoint(draft)
    return (
      <fieldset key={String(slot)} className={`point-card${isPlacing ? ' is-placing' : ''}`}>
        <legend className="visually-hidden">{title}</legend>
        <div className="point-head">
          <span className={`point-letter is-${isPhase ? 'phase' : slot}`}>{badge}</span>
          <span className="point-title">{title}</span>
          {placed && !isPlacing && <span className="point-set" aria-label="location set">✓</span>}
          <button type="button" className={`place-btn${isPlacing ? ' is-on' : ''}`} onClick={() => setPlacing(slot)} aria-pressed={isPlacing}>
            {isPlacing ? 'Click the map' : 'Place on map'}
          </button>
          {isPhase && (
            <span className="phase-controls">
              <button type="button" className="icon-btn" onClick={() => movePhase(slot, -1)} disabled={slot === 0} aria-label={`Move phase ${slot + 1} earlier`}>↑</button>
              <button type="button" className="icon-btn" onClick={() => movePhase(slot, 1)} disabled={slot === form.phases.length - 1} aria-label={`Move phase ${slot + 1} later`}>↓</button>
              <button type="button" className="icon-btn" onClick={() => removePhase(slot)} aria-label={`Remove phase ${slot + 1}`}>✕</button>
            </span>
          )}
        </div>
        <div className="point-grid">
          <label className="span-2">
            <span>Name <em className="muted">optional</em></span>
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
        </div>
      </fieldset>
    )
  }

  const slots: Slot[] = ['start', ...form.phases.map((_, i) => i), ...(round ? [] : ['end' as const])]

  const setTripType = (tripType: TripType) => {
    set({ tripType })
    if (tripType === 'round' && placing === 'end') setPlacing('start')
  }

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
          <form className="mission-form walk-form" onSubmit={submit} noValidate>
            <section className="form-section" aria-labelledby="sec-mission">
              <h2 id="sec-mission"><span className="step">1</span> Mission</h2>
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
            </section>

            <section className="form-section" aria-labelledby="sec-route">
              <h2 id="sec-route"><span className="step">2</span> Route</h2>
              <div className="choice">
                <div className="segmented" role="radiogroup" aria-label="Trip type">
                  {([['linear', 'Linear  A → B'], ['round', 'Round trip  A ↺']] as const).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={form.tripType === value} className={form.tripType === value ? 'is-on' : ''} onClick={() => setTripType(value)}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="muted choice-hint">
                  {round ? 'Start at A, visit your phases, and come back to A. Needs at least one phase.' : 'Start at A and finish somewhere else, at B.'}
                </p>
              </div>

              {pointFields('start')}

              <div className="phases" aria-label="Phases">
                <div className="phases-head">
                  <span>Phases <em className="muted">optional · stops in walking order</em></span>
                  <span className="muted">{form.phases.length}/{MAX_PHASES}</span>
                </div>
                {form.phases.map((_, i) => pointFields(i))}
                <button type="button" className="add-phase" onClick={addPhase} disabled={form.phases.length >= MAX_PHASES}>
                  + Add phase
                </button>
              </div>

              {round ? <p className="muted round-note">↺ Finishes back at the start point (A).</p> : pointFields('end')}

              {route && route.legs.length > 1 && (
                <ol className="legs" aria-label="Legs">
                  {route.legs.map((leg, i) => <li key={i}><span>{leg.from} → {leg.to}</span><span className="mono-count">{formatDistance(leg.km)}</span></li>)}
                </ol>
              )}
            </section>

            <section className="form-section" aria-labelledby="sec-details">
              <h2 id="sec-details"><span className="step">3</span> Details <em className="muted">optional</em></h2>
              <label>
                <span>Planned date</span>
                <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label>
                <span>Objective</span>
                <textarea value={form.objective} onChange={(e) => set({ objective: e.target.value })} maxLength={500} rows={3} placeholder="What will this Marswalk do?" />
              </label>
            </section>

            <section className="form-section" aria-labelledby="sec-visibility">
              <h2 id="sec-visibility"><span className="step">4</span> Visibility</h2>
              <div className="choice">
                <div className="segmented" role="radiogroup" aria-label="Who can find it">
                  {([['public', 'Public'], ['unlisted', 'Unlisted']] as const).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={form.visibility === value} className={form.visibility === value ? 'is-on' : ''} onClick={() => set({ visibility: value })}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="muted choice-hint">
                  {form.visibility === 'public'
                    ? 'Anyone can see it and its crew when browsing. Joining still needs the code.'
                    : 'Only people with the code can open it, until it’s completed.'}
                </p>
              </div>
            </section>

            <div className="form-footer">
              <p className="form-footer-summary" aria-live="polite">
                {route ? (
                  <>
                    <strong className="plain">{formatDistance(route.totalKm)}</strong>
                    <span className="muted"> straight line{form.phases.length ? ` · ${form.phases.length} phase${form.phases.length === 1 ? '' : 's'}` : ''}{round ? ' · round trip' : ''}</span>
                  </>
                ) : (
                  <span className="muted">{round && start && phases.length === 0 ? 'Add at least one phase for a round trip.' : 'Set every point to see the distance.'}</span>
                )}
              </p>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="form-actions">
                <button className="button" type="submit" disabled={saving || !form.name.trim() || codeStatus !== 'available' || !route}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create Marswalk'}
                </button>
                <button type="button" className="button-outline" onClick={onCancel}>Cancel</button>
              </div>
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
        <MarsMap2D points={markers} closed={round} onPick={user ? pick : undefined} focus={focus} label="Marswalk planning map" />
        {user && <p className="muted map-hint">Click the map to place <strong className="plain">{slotLabel(placing)}</strong>. Drag to pan, scroll to zoom.</p>}
      </section>
    </main>
  )
}
