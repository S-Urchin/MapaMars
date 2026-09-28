import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { isConnected, nasaData } from '../config/nasaData'
import { formatLat, formatLon, MARS_RADIUS_KM } from '../data/mars'
import { getMarsTextures } from './marsTexture'

export type LatLon = { lat: number; lon: number }

type Props = {
  start?: LatLon | null
  end?: LatLon | null
  startLabel?: string
  endLabel?: string
  /** Called when the map is clicked (not dragged). Omit for a read-only map. */
  onPick?: (point: LatLon) => void
  /** Move the view here; pass a new object to move again. `span` is the width shown, in degrees. */
  focus?: (LatLon & { span?: number }) | null
  label?: string
}

// Map units: x = lon + 180 (0..360), y = 90 - lat (0..180), matching an equirectangular image.
const toX = (lon: number) => lon + 180
const toY = (lat: number) => 90 - lat
const MIN_SPAN = 0.02 // about 1.2 km across at the equator: Marswalk scale
const MAX_SPAN = 400

// Imagery: the NASA source once connected, else a custom image, else the generated texture
const CUSTOM_IMAGE = '/resources/mars.jpg'
let generatedImage: string | null = null
const generatedTexture = () => (generatedImage ??= getMarsTextures().color.toDataURL('image/jpeg', 0.9))

function useMapImage() {
  const [src, setSrc] = useState(() => (isConnected(nasaData.surfaceImagery) ? nasaData.surfaceImagery.url : generatedTexture()))
  useEffect(() => {
    if (isConnected(nasaData.surfaceImagery)) return
    const img = new Image()
    img.onload = () => setSrc(CUSTOM_IMAGE)
    img.src = CUSTOM_IMAGE
  }, [])
  return src
}

function initialView(start?: LatLon | null, end?: LatLon | null) {
  if (start && end) {
    const span = Math.max(Math.abs(start.lon - end.lon), Math.abs(start.lat - end.lat) * 2) * 3
    return { cx: toX((start.lon + end.lon) / 2), cy: toY((start.lat + end.lat) / 2), w: Math.min(MAX_SPAN, Math.max(span, 0.1)) }
  }
  const one = start ?? end
  if (one) return { cx: toX(one.lon), cy: toY(one.lat), w: 20 }
  return { cx: 180, cy: 90, w: 360 }
}

const GRID_STEPS = [30, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005]

function niceKm(km: number) {
  const pow = 10 ** Math.floor(Math.log10(km))
  const n = km / pow
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow
}

export function MarsMap2D({ start, end, startLabel = 'Start', endLabel = 'End', onPick, focus, label = 'Map of Mars' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 450 })
  const [view, setView] = useState(() => initialView(start, end))
  const [hover, setHover] = useState<LatLon | null>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: number } | null>(null)
  const image = useMapImage()

  const h = view.w * (size.h / size.w)
  const left = view.cx - view.w / 2
  const top = view.cy - h / 2
  const unitsPerPx = view.w / size.w

  useEffect(() => {
    const el = hostRef.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Move the view when a new `focus` arrives (adjusting state during render, not in an effect)
  const [appliedFocus, setAppliedFocus] = useState(focus)
  if (focus !== appliedFocus) {
    setAppliedFocus(focus)
    if (focus) setView((v) => ({ cx: toX(focus.lon), cy: toY(focus.lat), w: focus.span ?? Math.min(v.w, 10) }))
  }

  const clampView = (v: { cx: number; cy: number; w: number }) => {
    const w = Math.min(MAX_SPAN, Math.max(MIN_SPAN, v.w))
    return { w, cx: Math.min(360, Math.max(0, v.cx)), cy: Math.min(180, Math.max(0, v.cy)) }
  }

  const zoomAt = (factor: number, px = size.w / 2, py = size.h / 2) => {
    setView((v) => {
      const vh = v.w * (size.h / size.w)
      const mx = v.cx - v.w / 2 + (px / size.w) * v.w
      const my = v.cy - vh / 2 + (py / size.h) * vh
      const w = Math.min(MAX_SPAN, Math.max(MIN_SPAN, v.w * factor))
      const nh = w * (size.h / size.w)
      return clampView({ w, cx: mx - (px / size.w - 0.5) * w, cy: my - (py / size.h - 0.5) * nh })
    })
  }

  // Wheel zoom needs a non-passive listener to stop the page from scrolling
  useEffect(() => {
    const el = hostRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(e.deltaY > 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const pointAt = (clientX: number, clientY: number): LatLon | null => {
    const rect = hostRef.current!.getBoundingClientRect()
    const x = left + ((clientX - rect.left) / rect.width) * view.w
    const y = top + ((clientY - rect.top) / rect.height) * h
    if (x < 0 || x > 360 || y < 0 || y > 180) return null
    return { lat: 90 - y, lon: x - 180 }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    setHover(pointAt(e.clientX, e.clientY))
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.moved = Math.max(d.moved, Math.hypot(dx, dy))
    setView((v) => clampView({ ...v, cx: d.cx - dx * unitsPerPx, cy: d.cy - dy * unitsPerPx }))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (d && d.moved < 4 && onPick) {
      const p = pointAt(e.clientX, e.clientY)
      if (p) onPick(p)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = view.w * 0.1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[e.key]) {
      e.preventDefault()
      setView((v) => clampView({ ...v, cx: v.cx + moves[e.key][0], cy: v.cy + moves[e.key][1] }))
    } else if (e.key === '+' || e.key === '=') zoomAt(0.8)
    else if (e.key === '-') zoomAt(1.25)
  }

  // Grid lines at a spacing that suits the zoom level
  const grid = useMemo(() => {
    const step = GRID_STEPS.find((s) => view.w / s <= 12) ?? GRID_STEPS[GRID_STEPS.length - 1]
    const xs: number[] = []
    const ys: number[] = []
    for (let x = Math.ceil(Math.max(0, left) / step) * step; x <= Math.min(360, left + view.w); x += step) xs.push(x)
    for (let y = Math.ceil(Math.max(0, top) / step) * step; y <= Math.min(180, top + h); y += step) ys.push(y)
    return { xs, ys }
  }, [left, top, view.w, h])

  // Scale bar sized for about 110px, measured at the view's centre latitude
  const scale = useMemo(() => {
    const lat = 90 - view.cy
    const kmPerDeg = ((2 * Math.PI * MARS_RADIUS_KM) / 360) * Math.max(0.05, Math.cos((lat * Math.PI) / 180))
    const km = niceKm(110 * unitsPerPx * kmPerDeg)
    return { km, px: km / (unitsPerPx * kmPerDeg) }
  }, [view.cy, unitsPerPx])

  const toPx = (p: LatLon) => ({ x: (toX(p.lon) - left) / unitsPerPx, y: (toY(p.lat) - top) / unitsPerPx })
  const a = start ? toPx(start) : null
  const b = end ? toPx(end) : null

  return (
    <div className="map2d">
      <div
        ref={hostRef}
        className={`map2d-surface${onPick ? ' is-pickable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="application"
        aria-label={`${label}. Drag or use arrow keys to pan, scroll or plus and minus to zoom${onPick ? ', click to place a point' : ''}.`}
      >
        <svg viewBox={`${left} ${top} ${view.w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          <rect x="-1000" y="-1000" width="3000" height="3000" fill="#000" />
          <image href={image} x="0" y="0" width="360" height="180" preserveAspectRatio="none" />
          <g className="map2d-grid">
            {grid.xs.map((x) => <line key={`x${x}`} x1={x} x2={x} y1={0} y2={180} />)}
            {grid.ys.map((y) => <line key={`y${y}`} x1={0} x2={360} y1={y} y2={y} />)}
          </g>
          {start && end && (
            <line className="map2d-route" x1={toX(start.lon)} y1={toY(start.lat)} x2={toX(end.lon)} y2={toY(end.lat)} />
          )}
        </svg>

        {a && (
          <div className="map2d-marker is-start" style={{ transform: `translate(${a.x}px, ${a.y}px)` }}>
            <span className="map2d-pin">A</span><span className="map2d-label">{startLabel}</span>
          </div>
        )}
        {b && (
          <div className="map2d-marker is-end" style={{ transform: `translate(${b.x}px, ${b.y}px)` }}>
            <span className="map2d-pin">B</span><span className="map2d-label">{endLabel}</span>
          </div>
        )}

        <div className="map2d-zoom">
          <button type="button" onClick={() => zoomAt(0.5)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomAt(2)} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setView(initialView(start, end))} aria-label="Reset view" title="Reset view">⤢</button>
        </div>

        <div className="map2d-scale" aria-hidden="true">
          <span style={{ width: scale.px }} />
          {scale.km >= 1 ? `${scale.km} km` : `${Math.round(scale.km * 1000)} m`}
        </div>
        <div className="map2d-readout" aria-hidden="true">
          {hover ? `${formatLat(hover.lat, 3)}  ${formatLon(hover.lon, 3)}` : ''}
        </div>
      </div>
      <p className="map2d-source muted">
        Imagery:{' '}
        {isConnected(nasaData.surfaceImagery)
          ? nasaData.surfaceImagery.source
          : image === CUSTOM_IMAGE
            ? 'custom image (public/resources/mars.jpg)'
            : 'placeholder (generated texture, not NASA data)'}
      </p>
    </div>
  )
}
