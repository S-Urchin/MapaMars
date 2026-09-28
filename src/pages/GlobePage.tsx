import { memo, useEffect, useState } from 'react'
import { MarsGlobe, type GlobeLayers, type GlobeMarker } from '../components/MarsGlobe'
import { SiteTerrain } from '../components/SiteTerrain'
import { formatHours, formatLat, formatLon, landingSites, localMeanSolarTime, marsClock } from '../data/mars'
import { siteScenes } from '../data/siteScenes'
import { useNow } from '../hooks/useNow'
import { clearWarpArrival, isWarpArrival } from '../lib/warp'

const Globe = memo(MarsGlobe)

// Matches the cloud-veil fade-in in App.css.
const DIVE_MS = 1400

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
  // 'site' swaps the globe for a close-up 3D scene of the selected landing site
  const [view, setView] = useState<'globe' | 'site'>('globe')
  const [poiId, setPoiId] = useState<string | null>(null)
  const [siteLayers, setSiteLayers] = useState({ labels: true, rotate: false })
  // True while the globe dives toward the site and clouds close in, before the close-up takes over
  const [diving, setDiving] = useState(false)

  useEffect(() => {
    if (!diving) return
    const id = setTimeout(() => {
      setDiving(false)
      setView('site')
    }, DIVE_MS)
    return () => clearTimeout(id)
  }, [diving])

  useEffect(clearWarpArrival, [])

  const { mtc } = marsClock(now)
  const site = landingSites.find((s) => s.id === selectedId)
  const scene = site ? siteScenes[site.id] : undefined
  const inSite = view === 'site' && !!scene

  const select = (id: string) => {
    setSelectedId(id)
    setView('globe')
    setDiving(false)
    setPoiId(null)
    setLayers((l) => (l.rotate ? { ...l, rotate: false } : l))
  }
  const toggleLayer = (key: keyof GlobeLayers) => setLayers((l) => ({ ...l, [key]: !l[key] }))
  const toggleSiteLayer = (key: 'labels' | 'rotate') => setSiteLayers((l) => ({ ...l, [key]: !l[key] }))
  const togglePoi = (id: string) => setPoiId((current) => (current === id ? null : id))
  const openSite = () => {
    setPoiId(null)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setView('site')
    else setDiving(true)
  }
  const closeSite = () => {
    setPoiId(null)
    setView('globe')
  }

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
          {inSite && site && scene ? (
            <>
              <SiteTerrain site={scene} selectedPoi={poiId} labels={siteLayers.labels} rotate={siteLayers.rotate} onSelectPoi={togglePoi} />
              <div className="cloud-veil is-out" aria-hidden="true" />
              <p className="terrain-caption">
                <span>{site.location}</span>
                <span className="muted">{formatLat(site.lat)} {formatLon(site.lon)}</span>
              </p>
              <p className="globe-hint">Drag to orbit · Right-drag to pan · Scroll to zoom</p>
            </>
          ) : (
            <>
              <Globe sites={siteMarkers} selectedId={selectedId} layers={layers} onSelect={select} dive={diving} />
              {diving && <div className="cloud-veil is-in" aria-hidden="true" />}
              <p className="globe-hint">Drag to rotate · Scroll to zoom</p>
            </>
          )}
        </div>
        {inSite ? (
          <div className="toggles" role="group" aria-label="Landing site view">
            <button type="button" onClick={closeSite}>← Globe</button>
            <button type="button" className={siteLayers.labels ? 'is-on' : ''} aria-pressed={siteLayers.labels} onClick={() => toggleSiteLayer('labels')}>Labels</button>
            <button type="button" className={siteLayers.rotate ? 'is-on' : ''} aria-pressed={siteLayers.rotate} onClick={() => toggleSiteLayer('rotate')}>Rotate</button>
          </div>
        ) : (
          <div className="toggles" role="group" aria-label="Globe layers">
            {LAYER_KEYS.map(({ key, label }) => (
              <button key={key} type="button" className={layers[key] ? 'is-on' : ''} aria-pressed={layers[key]} onClick={() => toggleLayer(key)}>{label}</button>
            ))}
          </div>
        )}
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
            {scene && (inSite ? (
              <>
                <button type="button" className="button-outline site-zoom" onClick={closeSite}>← Back to globe</button>
                <h3 className="poi-heading">Points of interest</h3>
                <ul className="poi-list">
                  {scene.pois.map((p) => (
                    <li key={p.id}>
                      <button type="button" className={p.id === poiId ? 'is-selected' : ''} aria-pressed={p.id === poiId} onClick={() => togglePoi(p.id)}>{p.title}</button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <button type="button" className="button site-zoom" onClick={openSite} disabled={diving}>{diving ? 'Descending…' : 'Zoom to landing site'}</button>
            ))}
          </>
        ) : (
          <p className="muted empty">Select a landing site from the list or click a marker on the globe.</p>
        )}
      </aside>
    </main>
  )
}
