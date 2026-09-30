import { memo, useEffect, useState } from 'react'
import { MarsGlobe, type GlobeLayers, type GlobeMarker } from '../components/MarsGlobe'
import { MARS_MODEL_CREDIT } from '../components/marsModel'
import { SiteTerrain } from '../components/SiteTerrain'
import { prepareSiteScene } from '../components/siteSceneBuild'
import { formatHours, formatLat, formatLon, formatPhTime, landingSites, localMeanSolarTime, marsClock } from '../data/mars'
import { sunLocalDirection, type MoonId } from '../data/marsSky'
import { moonsFromHorizons } from '../data/moonEphemeris'
import { siteScenes } from '../data/siteScenes'
import { useNow } from '../hooks/useNow'
import { clearWarpArrival, isWarpArrival } from '../lib/warp'
import { Icon, MoonCard, SiteCard, ToolDock, type Tool } from './globe/GlobeOverlay'

const Globe = memo(MarsGlobe)

// The globe's dive toward a landing site, then the cross-fade to its close-up (see .site-layer in App.css)
const DIVE_MS = 1300
const FADE_MS = 800

// Lighting choices for a landing-site close-up: the real Sun right now, or a fixed day or night sky
type SiteLight = 'live' | 'day' | 'night'
const SITE_LIGHTS: { id: SiteLight; label: string; icon: 'live' | 'sun' | 'moon'; title: string }[] = [
  { id: 'live', label: 'Live', icon: 'live', title: 'Where the Sun really is at the site right now' },
  { id: 'day', label: 'Day', icon: 'sun', title: 'Mid-morning sunlight, with long shadows' },
  { id: 'night', label: 'Night', icon: 'moon', title: 'After dark' },
]
const unit = (east: number, north: number, up: number) => {
  const l = Math.hypot(east, north, up)
  return { east: east / l, north: north / l, up: up / l }
}
const DAY_SUN = unit(0.72, -0.35, 0.6) // east-southeast, about 37° up
const NIGHT_SUN = unit(-0.6, 0.3, -0.74) // well below the horizon

const siteMarkers: GlobeMarker[] = landingSites.map((s) => ({
  id: s.id,
  label: s.mission,
  lat: s.lat,
  lon: s.lon,
  variant: s.status === 'ACTIVE' ? 'filled' : undefined,
}))

export function GlobePage() {
  const now = useNow()
  const nowMs = now.getTime()
  const { mtc } = marsClock(now)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [moonId, setMoonId] = useState<MoonId | null>(null)
  const [layers, setLayers] = useState<GlobeLayers>({ labels: true, orbits: true, grid: true })
  const [resetKey, setResetKey] = useState(0)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [arriving] = useState(isWarpArrival)
  // After the hyperspace jump, the controls wait until the camera has glided in to Mars
  const [landed, setLanded] = useState(!arriving)
  // 'site' shows a close-up 3D scene of the selected landing site over the (paused) globe
  const [view, setView] = useState<'globe' | 'site'>('globe')
  const [poiId, setPoiId] = useState<string | null>(null)
  const [siteLayers, setSiteLayers] = useState({ labels: true, rotate: false })
  const [siteLight, setSiteLight] = useState<SiteLight>('live')
  // Into a landing-site close-up and back out again:
  // 1. preparing: the site's terrain is generated while nothing is moving (a brief, unseen pause)
  // 2. diving: the globe camera dives toward the site, while the close-up is set up out of sight (siteMounted)
  // 3. view 'site': once the dive is done and the close-up is ready (siteReady), it fades in over the globe,
  //    and after that (siteShown) the globe pauses underneath
  // 4. back: the close-up fades out (leavingSite) while the globe zooms back out from where the dive stopped
  const [preparing, setPreparing] = useState(false)
  const [diving, setDiving] = useState(false)
  const [siteMounted, setSiteMounted] = useState(false)
  const [siteReady, setSiteReady] = useState(false)
  const [siteShown, setSiteShown] = useState(false)
  const [leavingSite, setLeavingSite] = useState(false)
  const [zoomOut, setZoomOut] = useState<{ lat: number; lon: number } | null>(null)
  const siteVisible = view === 'site' && siteReady

  useEffect(() => {
    if (!preparing) return
    const scene = selectedId ? siteScenes[selectedId] : undefined
    // Wait two frames so "Descending…" is on screen before the pause
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        if (scene) prepareSiteScene(scene)
        setPreparing(false)
        setSiteMounted(true)
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setView('site')
        else setDiving(true)
      })
    })
    return () => cancelAnimationFrame(id)
  }, [preparing, selectedId])

  useEffect(() => {
    if (!diving) return
    const id = setTimeout(() => setView('site'), DIVE_MS)
    return () => clearTimeout(id)
  }, [diving])

  useEffect(() => {
    if (!siteVisible || siteShown) return
    const id = setTimeout(() => {
      setSiteShown(true)
      setDiving(false)
    }, FADE_MS)
    return () => clearTimeout(id)
  }, [siteVisible, siteShown])

  useEffect(() => {
    if (!leavingSite) return
    const id = setTimeout(() => {
      setLeavingSite(false)
      setSiteMounted(false)
      setSiteReady(false)
    }, FADE_MS)
    return () => clearTimeout(id)
  }, [leavingSite])

  useEffect(clearWarpArrival, [])

  // Safety net: bring in the controls anyway if the globe never gets to land (for example, no WebGL)
  useEffect(() => {
    if (landed) return
    const id = setTimeout(() => setLanded(true), 8000)
    return () => clearTimeout(id)
  }, [landed])

  const site = landingSites.find((s) => s.id === selectedId)
  const scene = site ? siteScenes[site.id] : undefined
  const inSite = view === 'site' && !!scene
  // Where the Sun is over the site right now, so the close-up's shadows fall as they really would
  const siteSun = site ? sunLocalDirection(site.lat, site.lon, nowMs) : null
  const siteSunElevation = siteSun ? (Math.asin(siteSun.up) * 180) / Math.PI : 0
  const shownSun = siteLight === 'day' ? DAY_SUN : siteLight === 'night' ? NIGHT_SUN : siteSun

  // Drop any close-up at once (for jumping straight to something else)
  const resetSite = () => {
    setView('globe')
    setPoiId(null)
    setPreparing(false)
    setDiving(false)
    setSiteMounted(false)
    setSiteReady(false)
    setSiteShown(false)
  }
  const select = (id: string) => {
    resetSite()
    setSelectedId(id)
    setMoonId(null)
  }
  const selectMoon = (id: MoonId) => {
    resetSite()
    setMoonId(id)
    setSelectedId(null)
  }
  const closeCard = () => {
    resetSite()
    setSelectedId(null)
    setMoonId(null)
  }
  const toggleLayer = (key: keyof GlobeLayers) => setLayers((l) => ({ ...l, [key]: !l[key] }))
  const toggleSiteLayer = (key: 'labels' | 'rotate') => setSiteLayers((l) => ({ ...l, [key]: !l[key] }))
  const togglePoi = (id: string) => setPoiId((current) => (current === id ? null : id))
  const openSite = () => {
    setPoiId(null)
    setSiteShown(false)
    setPreparing(true)
  }
  const closeSite = () => {
    setPoiId(null)
    setView('globe')
    setSiteShown(false)
    setDiving(false)
    setLeavingSite(true)
    // A new object each time, so the globe flies out even when returning from the same site again
    if (site) setZoomOut({ lat: site.lat, lon: site.lon })
  }

  // Esc closes whatever is open: the close-up or info card first, then the tools.
  // Re-registered every render so it always acts on the current selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedId || moonId) {
        if (inSite) closeSite()
        else closeCard()
      } else setToolsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const globeTools: Tool[] = [
    { id: 'labels', label: 'Labels', icon: 'labels', on: layers.labels, onClick: () => toggleLayer('labels') },
    { id: 'orbits', label: 'Orbits', icon: 'orbits', on: layers.orbits, onClick: () => toggleLayer('orbits') },
    { id: 'grid', label: 'Grid', icon: 'grid', on: layers.grid, onClick: () => toggleLayer('grid') },
    { id: 'reset', label: 'Reset view', icon: 'reset', onClick: () => { closeCard(); setResetKey((k) => k + 1) } },
  ]
  const siteTools: Tool[] = [
    { id: 'back', label: 'Back to globe', icon: 'back', onClick: closeSite },
    { id: 'labels', label: 'Labels', icon: 'labels', on: siteLayers.labels, onClick: () => toggleSiteLayer('labels') },
    { id: 'rotate', label: 'Rotate', icon: 'rotate', on: siteLayers.rotate, onClick: () => toggleSiteLayer('rotate') },
  ]

  return (
    <main className={`globe-page${arriving ? ' is-arriving' : ''}${landed ? ' is-landed' : ''}`}>
      <div className="globe-frame">
        {/* The globe stays loaded under the close-up (paused), ready to zoom back out */}
        <Globe
          sites={siteMarkers}
          selectedId={selectedId}
          layers={layers}
          onSelect={select}
          onPick={closeCard}
          dive={diving}
          focus={zoomOut}
          paused={siteShown}
          selectedMoon={moonId}
          onSelectMoon={selectMoon}
          intro={arriving}
          onIntroDone={() => setLanded(true)}
          resetKey={resetKey}
        />
        {siteMounted && site && scene && (
          <div className={`site-layer${leavingSite ? ' is-leaving' : siteVisible ? ' is-visible' : ''}`} aria-hidden={!siteVisible}>
            <SiteTerrain
              site={scene}
              selectedPoi={poiId}
              labels={siteLayers.labels}
              rotate={siteLayers.rotate}
              onSelectPoi={togglePoi}
              sun={shownSun}
              active={view === 'site'}
              onReady={() => setSiteReady(true)}
            />
            {siteVisible && <div className="site-header">
              <button type="button" className="site-back" onClick={closeSite}>
                <Icon name="back" /> Back to globe
              </button>
              <p className="terrain-caption">
                <span>{site.mission} · {site.location}</span>
                <span className="muted">
                  {formatLat(site.lat)} {formatLon(site.lon)} · local time {formatHours(localMeanSolarTime(mtc, site.lon)).slice(0, 5)} ·{' '}
                  {siteLight === 'day' ? 'showing daytime' : siteLight === 'night' ? 'showing night-time' : siteSunElevation >= 0
                    ? `Sun ${Math.round(siteSunElevation)}° up`
                    // Mars's dusty sky keeps glowing until the Sun is about 10° down (see skyLightShare in SiteTerrain)
                    : `${siteSunElevation > -10 ? 'twilight' : 'night'}, Sun ${Math.round(-siteSunElevation)}° below the horizon`}
                </span>
              </p>
              <div className="light-switch" role="group" aria-label="Lighting">
                {SITE_LIGHTS.map((l) => (
                  <button key={l.id} type="button" className={siteLight === l.id ? 'is-on' : ''} aria-pressed={siteLight === l.id} title={l.title} onClick={() => setSiteLight(l.id)}>
                    <Icon name={l.icon} /> {l.label}
                  </button>
                ))}
              </div>
            </div>}
          </div>
        )}
      </div>

      {landed && (
        <>
          <p className="live-clock">
            <span className="live-clock-badge"><span className="live-dot" aria-hidden="true" />Live</span>
            <span>{formatPhTime(nowMs)}</span>
            <span className="muted">Mars {formatHours(mtc).slice(0, 5)} MTC</span>
          </p>
          <ToolDock open={toolsOpen} onToggle={() => setToolsOpen((o) => !o)} tools={inSite ? siteTools : globeTools} />
          <p className="globe-hint">
            {inSite ? 'Drag to orbit · Right-drag to pan · Scroll to zoom' : 'Drag to rotate · Scroll to zoom · Click a site or moon'}
            {!inSite && <span className="globe-credit">{MARS_MODEL_CREDIT}{moonsFromHorizons() && ' · Moon positions: JPL Horizons'}</span>}
          </p>
        </>
      )}

      {/* Keyed so each new selection slides its card in afresh; the landing-site close-up has none */}
      {site && !inSite ? (
        <SiteCard key={site.id} site={site} canExplore={!!scene} diving={preparing || diving} onExplore={openSite} onClose={closeCard} />
      ) : moonId ? (
        <MoonCard key={moonId} id={moonId} onClose={closeCard} />
      ) : null}
    </main>
  )
}
