import { memo, useEffect, useState } from 'react'
import { MarsGlobe, type GlobeLayers, type GlobeMarker } from '../components/MarsGlobe'
import { formatHours, formatLat, formatLon, landingSites, localMeanSolarTime, marsClock } from '../data/mars'
import { useNow } from '../hooks/useNow'
import { clearWarpArrival, isWarpArrival } from '../lib/warp'

const Globe = memo(MarsGlobe)

const siteMarkers: GlobeMarker[] = landingSites.map((s) => ({
  id: s.id,
  label: s.mission,
  lat: s.lat,
  lon: s.lon,
  variant: s.status === 'ACTIVE' ? 'filled' : undefined,
}))

const LAYER_KEYS: { key: keyof GlobeLayers; label: string }[] = [
  { key: 'grid', label: 'Grid' },
  { key: 'sites', label: 'Sites' },
  { key: 'orbits', label: 'Phobos' },
  { key: 'rotate', label: 'Rotate' },
]

export function GlobePage() {
  const now = useNow()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layers, setLayers] = useState<GlobeLayers>({ grid: true, sites: true, orbits: false, rotate: true })
  const [arriving] = useState(isWarpArrival)

  useEffect(clearWarpArrival, [])

  const { mtc } = marsClock(now)
  const site = landingSites.find((s) => s.id === selectedId)

  const select = (id: string) => {
    setSelectedId(id)
    setLayers((l) => (l.rotate ? { ...l, rotate: false } : l))
  }
  const toggleLayer = (key: keyof GlobeLayers) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  return (
    <main className={`globe-page${arriving ? ' is-arriving' : ''}`}>
      <aside className="site-list" aria-label="Landing sites">
        <h2>Landing sites</h2>
        <ul>
          {landingSites.map((s) => (
            <li key={s.id}>
              <button type="button" className={s.id === selectedId ? 'is-selected' : ''} onClick={() => select(s.id)} aria-pressed={s.id === selectedId}>
                <span>{s.mission}</span>
                <span className="muted">{s.landed}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="globe-stage">
        <div className="globe-frame">
          <Globe sites={siteMarkers} selectedId={selectedId} layers={layers} onSelect={select} />
          <p className="globe-hint">Drag to rotate · Scroll to zoom</p>
        </div>
        <div className="toggles" role="group" aria-label="Globe layers">
          {LAYER_KEYS.map(({ key, label }) => (
            <button key={key} type="button" className={layers[key] ? 'is-on' : ''} aria-pressed={layers[key]} onClick={() => toggleLayer(key)}>{label}</button>
          ))}
        </div>
      </section>

      <aside className="site-detail" aria-live="polite">
        {site ? (
          <>
            <h2>{site.mission}</h2>
            <p className="muted">{site.location}</p>
            <dl className="kv">
              <dt>Latitude</dt><dd>{formatLat(site.lat)}</dd>
              <dt>Longitude</dt><dd>{formatLon(site.lon)}</dd>
              <dt>Landed</dt><dd>{site.landed}</dd>
              <dt>Local time</dt><dd>{formatHours(localMeanSolarTime(mtc, site.lon))}</dd>
              <dt>Status</dt><dd>{site.status === 'ACTIVE' ? 'Active' : site.status === 'RETIRED' ? 'Retired' : 'Mission ended'}</dd>
            </dl>
            <p className="site-note">{site.note}</p>
          </>
        ) : (
          <p className="muted empty">Select a landing site from the list or click a marker on the globe.</p>
        )}
      </aside>
    </main>
  )
}
