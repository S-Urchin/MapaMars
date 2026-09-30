import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MarsGlobe, type GlobeLayers, type GlobeMarker } from '../components/MarsGlobe'
import { MOON_BOOST } from '../components/moonModel'
import { SiteTerrain } from '../components/SiteTerrain'
import { formatHours, formatLat, formatLon, formatUtc, landingSites, localMeanSolarTime, marsClock } from '../data/mars'
import type { MoonId } from '../data/marsSky'
import { siteScenes } from '../data/siteScenes'
import { useNow } from '../hooks/useNow'
import { clearWarpArrival, isWarpArrival } from '../lib/warp'
import { MoonCard, RotationCard, SiteSky } from './globe/SkyPanels'

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
  { key: 'moons', label: 'Moons' },
  { key: 'shadows', label: 'Moon shadows' },
]

const MOONS: { id: MoonId; name: string; designation: string }[] = [
  { id: 'phobos', name: 'Phobos', designation: 'Mars I' },
  { id: 'deimos', name: 'Deimos', designation: 'Mars II' },
]


export function GlobePage() {
  const now = useNow()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [moonId, setMoonId] = useState<MoonId | null>(null)
  const [layers, setLayers] = useState<GlobeLayers>({ grid: true, sites: true, moons: true, shadows: true })
  const [trueScale, setTrueScale] = useState(false)
  const [arriving] = useState(isWarpArrival)
  // After the hyperspace jump, even the "Show interface" button waits until the camera has glided in
  const [landed, setLanded] = useState(!arriving)
  // The page opens full screen on Mars alone; the interface appears only when asked for
  const [showGui, setShowGui] = useState(false)
  const guiShownBefore = useRef(showGui)
  const [holdSize, setHoldSize] = useState<{ w: number; h: number } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
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

  // Safety net: offer the interface anyway if the globe never gets to land (for example, no WebGL)
  useEffect(() => {
    if (landed) return
    const id = setTimeout(() => setLanded(true), 8000)
    return () => clearTimeout(id)
  }, [landed])

  // Esc leaves full screen, the key people reach for first
  useEffect(() => {
    if (showGui || !landed) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowGui(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showGui, landed])

  // Switching between full screen and the interface, the globe grows out of its frame or shrinks back
  // into it. The frame keeps its place in the layout throughout, so nothing around it moves.
  useLayoutEffect(() => {
    if (guiShownBefore.current === showGui) return
    guiShownBefore.current = showGui
    const frame = frameRef.current
    const host = frame?.querySelector<HTMLElement>('.globe-host:not(.terrain-host)')
    if (!frame || !host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = frame.getBoundingClientRect()
    const b = frame.clientLeft // border width
    const full = { top: '0px', left: '0px', width: `${document.documentElement.clientWidth}px`, height: `${window.innerHeight}px`, borderRadius: '0px' }
    const boxed = { top: `${r.top + b}px`, left: `${r.left + b}px`, width: `${r.width - 2 * b}px`, height: `${r.height - 2 * b}px`, borderRadius: '7px' }
    // Full screen is already fixed by CSS; the way back needs it fixed for the length of the shrink
    Object.assign(host.style, { position: 'fixed', zIndex: '20' })
    // Draw at window size throughout and let the globe scale the picture, rather than resize every frame
    setHoldSize({ w: document.documentElement.clientWidth, h: window.innerHeight })
    // Ease out: the globe starts moving the instant the button is pressed, then settles gently
    const resizeTo = host.animate(showGui ? [full, boxed] : [boxed, full], { duration: 800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    const done = () => {
      host.style.position = ''
      host.style.zIndex = ''
      setHoldSize(null)
    }
    resizeTo.onfinish = done
    return () => {
      resizeTo.onfinish = null
      resizeTo.cancel()
      done()
    }
  }, [showGui])

  const nowMs = now.getTime()
  const { mtc } = marsClock(now)
  const site = landingSites.find((s) => s.id === selectedId)
  const scene = site ? siteScenes[site.id] : undefined
  const inSite = view === 'site' && !!scene

  const select = (id: string) => {
    setSelectedId(id)
    setMoonId(null)
    setView('globe')
    setDiving(false)
    setPoiId(null)
  }
  const selectMoon = (id: MoonId) => {
    setMoonId(id)
    setView('globe')
    setDiving(false)
    setPoiId(null)
    setLayers((l) => (l.moons ? l : { ...l, moons: true }))
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
    <main className={`globe-page${arriving ? ' is-arriving' : ''}${showGui ? '' : ' is-immersive'}`}>
      {!showGui && landed && (
        <button type="button" className="gui-toggle is-show" onClick={() => setShowGui(true)}>
          <span aria-hidden="true">☰</span> Show interface
        </button>
      )}
      <aside className="site-list" aria-label="Landing sites and moons" inert={!showGui}>
        <h2>Landing sites</h2>
        <ul>
          {landingSites.map((s) => (
            <li key={s.id}>
              <button type="button" className={s.id === selectedId && !moonId ? 'is-selected' : ''} onClick={() => select(s.id)} aria-pressed={s.id === selectedId}>
                <span>{s.mission}</span>
                <span className="muted">{s.landed}</span>
              </button>
            </li>
          ))}
        </ul>
        <h2 className="site-list-heading">Moons</h2>
        <ul>
          {MOONS.map((m) => (
            <li key={m.id}>
              <button type="button" className={m.id === moonId ? 'is-selected' : ''} onClick={() => selectMoon(m.id)} aria-pressed={m.id === moonId}>
                <span>{m.name}</span>
                <span className="muted">{m.designation}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="globe-stage">
        <div className="globe-frame" ref={frameRef}>
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
              <Globe
                sites={siteMarkers}
                selectedId={selectedId}
                layers={layers}
                onSelect={select}
                dive={diving}
                selectedMoon={moonId}
                onSelectMoon={selectMoon}
                trueScale={trueScale}
                intro={arriving}
                onIntroDone={() => setLanded(true)}
                holdSize={holdSize}
              />
              {diving && <div className="cloud-veil is-in" aria-hidden="true" />}
              <p className="terrain-caption globe-clock">
                <span>Live · real speed</span>
                <span className="muted">{formatUtc(nowMs)} · Mars {formatHours(mtc)} MTC</span>
              </p>
              <p className="globe-hint">Drag to rotate · Scroll to zoom</p>
              {showGui && (
                <button type="button" className="gui-toggle is-hide" onClick={() => setShowGui(false)} title="Hide the interface and fill the screen with Mars">
                  <span aria-hidden="true">⛶</span> Full screen
                </button>
              )}
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
          <div className="toggles" role="group" aria-label="Globe layers" inert={!showGui}>
            {LAYER_KEYS.map(({ key, label }) => (
              <button key={key} type="button" className={layers[key] ? 'is-on' : ''} aria-pressed={layers[key]} onClick={() => toggleLayer(key)}>{label}</button>
            ))}
          </div>
        )}
      </section>

      <aside className="site-detail" aria-live="polite" inert={!showGui}>
        {moonId ? (
          // Keyed so switching moons fades the new card in, in step with the camera flight
          <div key={moonId} className="panel-fade">
            <MoonCard
              id={moonId}
              nowMs={nowMs}
              trueScale={trueScale}
              boost={MOON_BOOST}
              onToggleTrueScale={() => setTrueScale((t) => !t)}
              onClose={() => setMoonId(null)}
            />
          </div>
        ) : site ? (
          <div key={site.id} className="panel-fade">
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
            {!inSite && <SiteSky lat={site.lat} lon={site.lon} nowMs={nowMs} />}
          </div>
        ) : (
          <div className="panel-fade">
            <RotationCard nowMs={nowMs} />
          </div>
        )}
      </aside>
    </main>
  )
}
