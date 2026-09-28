import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CodeInput } from '../../components/CodeInput'
import { MarsMap2D, type LatLon } from '../../components/MarsMap2D'
import { formatDistance, formatLat, formatLon, marsDistanceKm } from '../../data/mars'
import { formatCode, sanitizeCode } from '../../lib/missionCode'
import type { User } from '../../services/auth'
import { createMissionLog, isMissionCodeAvailable, suggestMissionCode, updateMissionLog, type MissionLog, type MissionVisibility } from '../../services/missionLogs'
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
type Which = 'start' | 'end'

function initialForm(m?: MissionLog) {
  return {
    name: m?.name ?? '',
    startName: m?.startName ?? '',
    startLat: m ? String(m.startLat) : '',
    startLon: m ? String(m.startLon) : '',
    endName: m?.target ?? '',
    endLat: m ? String(m.lat) : '',
    endLon: m ? String(m.lon) : '',
    date: m?.date ?? '',
    objective: m?.objective ?? '',
    visibility: (m?.visibility ?? 'public') as MissionVisibility,
  }
}

type Form = ReturnType<typeof initialForm>

function parsePoint(lat: string, lon: string): LatLon | null {
  if (lat.trim() === '' || lon.trim() === '') return null
  const p = { lat: Number(lat), lon: Number(lon) }
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? p : null
}

const pointName = (name: string, p: LatLon) => name.trim() || `${formatLat(p.lat, 3)} ${formatLon(p.lon, 3)}`

export function MissionForm({ user, authLoading, mission, onSaved, onCancel }: Props) {
  const editing = !!mission
  const [form, setForm] = useState(() => initialForm(mission))
  const [placing, setPlacing] = useState<Which>(mission ? 'end' : 'start')
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

  const start = useMemo(() => parsePoint(form.startLat, form.startLon), [form.startLat, form.startLon])
  const end = useMemo(() => parsePoint(form.endLat, form.endLon), [form.endLat, form.endLon])
  const distance = start && end ? marsDistanceKm(start, end) : null

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setFormError(null)
  }
  const update = (field: keyof Form) => (e: { target: { value: string } }) => set({ [field]: e.target.value })

  // Clicking the map places whichever point is selected; after the start, move on to the end
  const pick = (p: LatLon) => {
    const lat = p.lat.toFixed(4)
    const lon = p.lon.toFixed(4)
    if (placing === 'start') {
      set({ startLat: lat, startLon: lon })
      if (!end) setPlacing('end')
    } else {
      set({ endLat: lat, endLon: lon })
    }
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
    if (!end) { setFormError('Set an end point: click the map or type its latitude and longitude.'); return }
    setSaving(true)
    setFormError(null)
    const fields = {
      code,
      name: form.name,
      startName: pointName(form.startName, start),
      startLat: start.lat,
      startLon: start.lon,
      target: pointName(form.endName, end),
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

  const pointFields = (which: Which) => {
    const isStart = which === 'start'
    const [nameKey, latKey, lonKey] = isStart ? (['startName', 'startLat', 'startLon'] as const) : (['endName', 'endLat', 'endLon'] as const)
    return (
      <fieldset className={`point-field${placing === which ? ' is-placing' : ''}`}>
        <legend>
          <span className={`point-letter is-${which}`}>{isStart ? 'A' : 'B'}</span>
          {isStart ? 'Start point' : 'End point'}
        </legend>
        <label className="span-2">
          <span>Place name <em className="muted">optional</em></span>
          <input value={form[nameKey]} onChange={update(nameKey)} maxLength={80} placeholder={isStart ? 'e.g. Habitat' : 'e.g. Delta outcrop'} />
        </label>
        <label>
          <span>Latitude</span>
          <input value={form[latKey]} onChange={update(latKey)} inputMode="decimal" placeholder="-90 to 90" />
        </label>
        <label>
          <span>Longitude (east)</span>
          <input value={form[lonKey]} onChange={update(lonKey)} inputMode="decimal" placeholder="-180 to 180" />
        </label>
      </fieldset>
    )
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
          <form className="mission-form" id="mission-form" onSubmit={submit} noValidate>
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
              <input value={form.name} onChange={update('name')} maxLength={80} required placeholder="e.g. Delta Survey I" />
            </label>

            {pointFields('start')}
            {pointFields('end')}

            <p className="route-summary" aria-live="polite">
              {distance !== null
                ? <>Straight-line distance: <strong className="plain">{formatDistance(distance)}</strong> <span className="muted">(derived; terrain not included yet)</span></>
                : <span className="muted">Set both points to see the distance.</span>}
            </p>

            <label>
              <span>Planned date <em className="muted">optional</em></span>
              <input type="date" value={form.date} onChange={update('date')} />
            </label>
            <label>
              <span>Objective <em className="muted">optional</em></span>
              <textarea value={form.objective} onChange={update('objective')} maxLength={500} rows={3} placeholder="What will this Marswalk do?" />
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
              <button className="button" type="submit" disabled={saving || !form.name.trim() || codeStatus !== 'available' || !start || !end}>
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
              {(['start', 'end'] as const).map((w) => (
                <button key={w} type="button" role="radio" aria-checked={placing === w} className={placing === w ? 'is-on' : ''} onClick={() => setPlacing(w)}>
                  Place {w === 'start' ? 'A · start' : 'B · end'}
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
        <MarsMap2D
          start={start}
          end={end}
          startLabel={form.startName.trim() || 'Start'}
          endLabel={form.endName.trim() || 'End'}
          onPick={user ? pick : undefined}
          focus={focus}
          label="Marswalk planning map"
        />
        {user && <p className="muted map-hint">Click the map to place {placing === 'start' ? 'A (start)' : 'B (end)'}. Drag to pan, scroll to zoom.</p>}
      </section>
    </main>
  )
}
