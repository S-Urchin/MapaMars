import { useState } from 'react'
import { formatHours, formatLat, formatLon, formatUtc, marsClock } from '../../data/mars'
import { moonInfo, rotationInfo, shadowInfo } from '../../data/marsMoons'
import {
  AXIAL_TILT_DEG, daysSinceJ2000, inMarsShadow, MARS_EQUATOR_RADIUS_KM, MARS_RADIUS_KM, marsRotationDeg, meiToBodyFixed,
  moonPeriodDays, moonPosition, moonShadowAt, nextShadowOnMars, nextTransit, seasonName, SIDEREAL_DAY_S, SOL_S,
  solarLongitude, subsolarPoint, sunElevationDeg, sunFromMars, toLatLon, type MoonId, type TransitEvent,
} from '../../data/marsSky'

const DAY_MS = 86_400_000
const MARS_YEAR_DAYS = 687

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h} h ${m} min ${s.toFixed(1)} s`
}

/** "in 3 d 4 h", "in 12 min", "now" */
function formatUntil(ms: number) {
  if (ms <= 0) return 'now'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `in ${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `in ${h} h ${min % 60} min`
  return `in ${Math.floor(h / 24)} d ${h % 24} h`
}

/**
 * Result of a slow search for an upcoming event, redone only when it goes stale: once the event is over,
 * or after `retryMs` when nothing was found. Setting state during render is React's pattern for this.
 */
function useUpcoming<T>(key: string, nowMs: number, find: () => T | null, over: (event: T) => number, retryMs: number) {
  const [cache, setCache] = useState<{ key: string; from: number; value: T | null } | null>(null)
  const stale = !cache || cache.key !== key || (cache.value ? nowMs > over(cache.value) : nowMs > cache.from + retryMs)
  if (!stale) return cache.value
  const next = { key, from: nowMs, value: find() }
  setCache(next)
  return next.value
}

const EQUATOR_SPEED_KMH = (2 * Math.PI * MARS_EQUATOR_RADIUS_KM) / (SIDEREAL_DAY_S / 3600)

export function RotationCard({ nowMs }: { nowMs: number }) {
  const d = daysSinceJ2000(nowMs)
  const { msd, mtc } = marsClock(new Date(nowMs))
  const ls = solarLongitude(nowMs)
  const sub = subsolarPoint(nowMs)
  return (
    <>
      <h2>Mars rotation</h2>
      <p className="muted">Live, turning at its real speed</p>
      <dl className="kv">
        <dt>Earth time</dt><dd>{formatUtc(nowMs)}</dd>
        <dt>Mars Sol Date</dt><dd>{msd.toFixed(3)}</dd>
        <dt>Mars time</dt><dd>{formatHours(mtc)} MTC</dd>
        <dt>Turned</dt><dd>{marsRotationDeg(d).toFixed(2)}°</dd>
        <dt>Sun overhead</dt><dd>{formatLat(sub.lat)} {formatLon(sub.lon)}</dd>
        <dt>Season</dt><dd>Ls {ls.toFixed(1)}°</dd>
      </dl>
      <p className="sky-season">{seasonName(ls)}</p>
      <h3 className="poi-heading">Spin</h3>
      <dl className="kv">
        <dt>Sidereal day</dt><dd>{formatDuration(SIDEREAL_DAY_S)}</dd>
        <dt>Sol</dt><dd>{formatDuration(SOL_S)}</dd>
        <dt>At the equator</dt><dd>{Math.round(EQUATOR_SPEED_KMH)} km/h</dd>
        <dt>Axial tilt</dt><dd>{AXIAL_TILT_DEG}°</dd>
      </dl>
      {rotationInfo.map((p) => <p key={p} className="site-note">{p}</p>)}
      <p className="muted sky-hint">At real speed Mars turns about a quarter of a degree a minute. Select a landing site or a moon to study it.</p>
    </>
  )
}

type MoonCardProps = {
  id: MoonId
  nowMs: number
  trueScale: boolean
  boost: number
  onToggleTrueScale: () => void
  onClose: () => void
}

export function MoonCard({ id, nowMs, trueScale, boost, onToggleTrueScale, onClose }: MoonCardProps) {
  const info = moonInfo[id]
  const d = daysSinceJ2000(nowMs)
  const pos = moonPosition(id, d)
  const dist = Math.hypot(...pos)
  const eclipsed = inMarsShadow(pos, sunFromMars(d).dir)
  const shadow = moonShadowAt(id, nowMs)
  const shadowAt = shadow ? toLatLon(meiToBodyFixed(shadow.center, d)) : null
  const nextShadow = useUpcoming(id, nowMs, () => nextShadowOnMars(id, nowMs), (t) => t, DAY_MS)
  const periodH = moonPeriodDays(id) * 24
  return (
    <>
      <h2>{info.name}</h2>
      <p className="muted">{info.designation} · {info.meaning}</p>
      <dl className="kv">
        <dt>Size</dt><dd>{info.size}</dd>
        <dt>Mass</dt><dd>{info.mass}</dd>
        <dt>Density</dt><dd>{info.density}</dd>
        <dt>Orbit</dt><dd>{Math.floor(periodH)} h {Math.round((periodH % 1) * 60)} min</dd>
        <dt>Escape speed</dt><dd>{info.escapeSpeed}</dd>
        <dt>Distance now</dt><dd>{Math.round(dist).toLocaleString()} km</dd>
        <dt>Altitude now</dt><dd>{Math.round(dist - MARS_RADIUS_KM).toLocaleString()} km</dd>
        <dt>Sunlight</dt><dd>{eclipsed ? 'In Mars’s shadow' : 'Sunlit'}</dd>
      </dl>
      <p className="site-note">Discovered {info.discovered}. Average distance {info.distance}.</p>
      {info.background.map((p) => <p key={p} className="site-note">{p}</p>)}
      <h3 className="poi-heading">Seen from Mars</h3>
      <p className="sky-text">{info.fromSurface}</p>

      <h3 className="poi-heading">Shadow on Mars</h3>
      {shadow && shadowAt ? (
        <dl className="kv">
          <dt>Falling on</dt><dd>{formatLat(shadowAt.lat)} {formatLon(shadowAt.lon)}</dd>
          <dt>Width</dt><dd>≈ {Math.round(shadow.radiusKm * 2)} km</dd>
          <dt>Sun covered</dt><dd>up to {Math.round(shadow.coverage * 100)}%</dd>
        </dl>
      ) : (
        <p className="sky-text">
          <span className="muted">Not on the planet right now.</span>
          {nextShadow && <> Next one {formatUntil(nextShadow - nowMs)} <span className="muted">({formatUtc(nextShadow)})</span></>}
        </p>
      )}
      {shadowInfo.map((p) => <p key={p} className="site-note">{p}</p>)}

      <div className="toggles sky-toggles">
        <button type="button" className={trueScale ? 'is-on' : ''} aria-pressed={trueScale} onClick={onToggleTrueScale}>True size</button>
      </div>
      <p className="muted sky-hint">
        {trueScale ? 'Shown at real size: tiny next to Mars.' : `Enlarged ${boost}× so the shape is visible; orbit distances are to scale.`} Positions
        come from NASA JPL mean orbital elements.
      </p>
      <button type="button" className="button-outline site-zoom" onClick={onClose}>← Close</button>
    </>
  )
}

type SiteSkyProps = { lat: number; lon: number; nowMs: number }

export function SiteSky({ lat, lon, nowMs }: SiteSkyProps) {
  const sunEl = sunElevationDeg(lat, lon, daysSinceJ2000(nowMs))
  return (
    <>
      <h3 className="poi-heading">Sky here</h3>
      <dl className="kv">
        <dt>Sun</dt><dd>{sunEl >= 0 ? `${sunEl.toFixed(1)}° above horizon` : `Below horizon (${sunEl.toFixed(0)}°)`}</dd>
      </dl>
      <h3 className="poi-heading">Moon transits</h3>
      <TransitRow moon="phobos" lat={lat} lon={lon} nowMs={nowMs} />
      <TransitRow moon="deimos" lat={lat} lon={lon} nowMs={nowMs} />
      <p className="muted sky-hint">A transit is a moon crossing the Sun. Predicted from mean orbits, so real times can differ by a few days.</p>
    </>
  )
}

function TransitRow({ moon, lat, lon, nowMs }: { moon: MoonId } & SiteSkyProps) {
  const t = useUpcoming<TransitEvent>(`${moon}:${lat}:${lon}`, nowMs, () => nextTransit(moon, lat, lon, nowMs, MARS_YEAR_DAYS), (e) => e.end, 30 * DAY_MS)
  const name = moon === 'phobos' ? 'Phobos' : 'Deimos'
  if (!t) return <p className="sky-text"><strong>{name}</strong> <span className="muted">None within one Mars year</span></p>
  const live = nowMs >= t.start && nowMs <= t.end
  return (
    <div className="transit-row">
      <p className="sky-text">
        <strong>{name}</strong> <span className="muted">{live ? 'crossing the Sun now' : formatUntil(t.start - nowMs)}</span>
      </p>
      <p className="muted transit-detail">
        {formatUtc(t.peak)} · {Math.round((t.end - t.start) / 1000)} s · covers {Math.max(1, Math.round(t.coverage * 100))}% of the Sun
      </p>
    </div>
  )
}
