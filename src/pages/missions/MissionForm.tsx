import { memo, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CodeInput } from '../../components/CodeInput'
import { MarsGlobe, type GlobeLayers, type GlobeMarker } from '../../components/MarsGlobe'
import { formatLat, formatLon } from '../../data/mars'
import { formatCode, sanitizeCode } from '../../lib/missionCode'
import type { User } from '../../services/auth'
import { createMissionLog, isMissionCodeAvailable, suggestMissionCode, updateMissionLog, type MissionLog, type MissionVisibility } from '../../services/missionLogs'
import { CUSTOM_TARGET, presets } from './shared'

const Globe = memo(MarsGlobe)
const LAYERS: GlobeLayers = { grid: true, sites: true, orbits: false, rotate: false }
const DRAFT_ID = '__draft__'

type Props = {
  user: User | null
  authLoading: boolean
  /** Present when editing an existing mission. */
  mission?: MissionLog
  onSaved: (m: MissionLog) => void
  onCancel: () => void
}

type CodeStatus = 'incomplete' | 'checking' | 'available' | 'taken' | 'error'

function initialForm(m?: MissionLog) {
  if (!m) return { name: '', preset: presets[0].value, target: '', lat: '', lon: '', date: '', objective: '', visibility: 'public' as MissionVisibility }
  return { name: m.name, preset: CUSTOM_TARGET, target: m.target, lat: String(m.lat), lon: String(m.lon), date: m.date, objective: m.objective, visibility: m.visibility }
}

export function MissionForm({ user, authLoading, mission, onSaved, onCancel }: Props) {
  const editing = !!mission
  const [form, setForm] = useState(() => initialForm(mission))
  const [raw, setRaw] = useState(() => sanitizeCode(mission?.code ?? ''))
  const [checked, setChecked] = useState<{ raw: string; status: CodeStatus } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [focus, setFocus] = useState(() => (mission ? { lat: mission.lat, lon: mission.lon } : { lat: presets[0].lat, lon: presets[0].lon }))

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

  const target = useMemo(() => {
    if (form.preset === CUSTOM_TARGET) {
      const lat = Number(form.lat), lon = Number(form.lon)
      const valid = form.lat.trim() !== '' && form.lon.trim() !== '' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      return valid ? { name: form.target.trim(), lat, lon } : null
    }
    const p = presets.find((x) => x.value === form.preset)!
    return { name: p.name, lat: p.lat, lon: p.lon }
  }, [form.preset, form.target, form.lat, form.lon])

  const markers = useMemo<GlobeMarker[]>(
    () => (target ? [{ id: DRAFT_ID, label: target.name || form.name || 'Your target', lat: target.lat, lon: target.lon, variant: 'pin' }] : []),
    [target, form.name],
  )

  const update = (field: keyof ReturnType<typeof initialForm>) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setFormError(null)
  }

  const pickOnGlobe = (lat: number, lon: number) => {
    setForm((f) => ({ ...f, preset: CUSTOM_TARGET, lat: lat.toFixed(2), lon: lon.toFixed(2) }))
    setFormError(null)
  }

  const choosePreset = (value: string) => {
    setForm((f) => ({ ...f, preset: value }))
    const p = presets.find((x) => x.value === value)
    if (p) setFocus({ lat: p.lat, lon: p.lon })
    setFormError(null)
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
    if (!target) { setFormError('Enter a latitude and longitude, or click the globe to pick a spot.'); return }
    setSaving(true)
    setFormError(null)
    const fields = {
      code,
      name: form.name,
      target: target.name || `${formatLat(target.lat)} ${formatLon(target.lon)}`,
      lat: target.lat,
      lon: target.lon,
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

  return (
    <main className="missions-page">
      <section className="mission-form-wrap">
        <h1>{editing ? 'Edit mission' : 'New mission'}</h1>
        <p className="muted">
          {editing ? 'Change the details and save. Anyone with the code sees the update.' : 'Choose a code: it’s the invite people use to join your crew. Then plan the mission.'}
        </p>

        {authLoading ? null : !user ? (
          <div className="signin-prompt">
            <p>Sign in to create a mission. You can edit or delete it later.</p>
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
              <input value={form.name} onChange={update('name')} maxLength={80} required placeholder="e.g. Red Dawn I" />
            </label>
            <label>
              <span>Target</span>
              <select value={form.preset} onChange={(e) => choosePreset(e.target.value)}>
                {['Landmarks', 'Landing sites'].map((group) => (
                  <optgroup key={group} label={group}>
                    {presets.filter((p) => p.group === group).map((p) => <option key={p.value} value={p.value}>{p.name}</option>)}
                  </optgroup>
                ))}
                <option value={CUSTOM_TARGET}>Custom coordinates…</option>
              </select>
            </label>
            {form.preset === CUSTOM_TARGET && (
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
            <fieldset className="visibility-field">
              <legend>Who can find it</legend>
              {([
                ['public', 'Public', 'Anyone can see it and its crew when browsing. Joining still needs the code.'],
                ['unlisted', 'Unlisted', 'Only people with the code can open it, until it’s completed.'],
              ] as const).map(([value, label, hint]) => (
                <label key={value} className="radio-option">
                  <input type="radio" name="visibility" value={value} checked={form.visibility === value} onChange={() => setForm((f) => ({ ...f, visibility: value }))} />
                  <span><span className="plain">{label}</span><span className="muted">{hint}</span></span>
                </label>
              ))}
            </fieldset>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="form-actions">
              <button className="button" type="submit" disabled={saving || !form.name.trim() || codeStatus !== 'available'}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create mission'}
              </button>
              <button type="button" className="button-outline" onClick={onCancel}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section className="mission-globe">
        <div className="globe-frame">
          <Globe sites={markers} layers={LAYERS} onPick={user ? pickOnGlobe : undefined} focus={focus} />
          <p className="globe-hint">{user ? 'Click to pick a target · Drag to rotate' : 'Drag to rotate · Scroll to zoom'}</p>
        </div>
      </section>
    </main>
  )
}
