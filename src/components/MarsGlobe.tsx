import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { formatLat, formatLon } from '../data/mars'
import { createMarsTextures } from './marsTexture'

// Drop an equirectangular Mars map here to replace the procedural surface.
const TEXTURE_URL = '/resources/mars.jpg'
const CAMERA_DISTANCE = 4.4

export type GlobeLayers = { grid: boolean; sites: boolean; orbits: boolean; rotate: boolean }

export type GlobeMarker = {
  id: string
  label: string
  lat: number
  lon: number
  /** 'filled' for highlighted markers, 'pin' for a pending pick; hollow by default. */
  variant?: 'filled' | 'pin'
}

type Props = {
  sites?: GlobeMarker[]
  selectedId?: string | null
  layers: GlobeLayers
  onSelect?: (id: string) => void
  /** When false the globe only spins: no dragging, zooming, markers or cursor readout. */
  interactive?: boolean
  /** Called with the surface coordinates when the planet is clicked (not dragged). */
  onPick?: (lat: number, lon: number) => void
  /** Fly the camera to a point; pass a new object each time to fly again. */
  focus?: { lat: number; lon: number } | null
}

// Generating the surface takes a moment, so share it between globe instances.
let proceduralCache: ReturnType<typeof createMarsTextures> | null = null

function latLonToVector(lat: number, lon: number, radius = 1) {
  const la = THREE.MathUtils.degToRad(lat)
  const lo = THREE.MathUtils.degToRad(lon)
  return new THREE.Vector3(
    radius * Math.cos(la) * Math.cos(lo),
    radius * Math.sin(la),
    -radius * Math.cos(la) * Math.sin(lo),
  )
}

function buildGraticule() {
  const points: THREE.Vector3[] = []
  const r = 1.003
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 4) {
      points.push(latLonToVector(lat, lon, r), latLonToVector(lat, lon + 4, r))
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -88; lat < 88; lat += 4) {
      points.push(latLonToVector(lat, lon, r), latLonToVector(lat + 4, lon, r))
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points)
}

const NO_SITES: GlobeMarker[] = []

export function MarsGlobe({ sites = NO_SITES, selectedId = null, layers, onSelect, interactive = true, onPick, focus = null }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onPickRef = useRef(onPick)
  const sitesRef = useRef(sites)
  useEffect(() => {
    onPickRef.current = onPick
    sitesRef.current = sites
  })
  const readoutRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef(new Map<string, HTMLButtonElement>())
  const stateRef = useRef({
    layers,
    focus: null as THREE.Vector3 | null,
    graticule: null as THREE.Object3D | null,
    orbit: null as THREE.Object3D | null,
    siteVectors: new Map<string, THREE.Vector3>(),
  })

  useEffect(() => {
    const host = hostRef.current!
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0.8, 0.5, 2.8).setLength(CAMERA_DISTANCE)
    scene.add(camera)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.prepend(renderer.domElement)

    // Surface
    proceduralCache ??= createMarsTextures(1024)
    const colorMap = new THREE.CanvasTexture(proceduralCache.color)
    colorMap.colorSpace = THREE.SRGBColorSpace
    colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const bumpMap = new THREE.CanvasTexture(proceduralCache.bump)
    const material = new THREE.MeshStandardMaterial({ map: colorMap, bumpMap, bumpScale: 2.2, roughness: 0.95, metalness: 0 })
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), material)
    scene.add(globe)

    new THREE.TextureLoader().load(TEXTURE_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      material.map = tex
      material.bumpScale = 0.6
      material.needsUpdate = true
      colorMap.dispose()
    }, undefined, () => { /* no custom texture; keep the procedural one */ })

    // Thin dusty atmosphere rim
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.07, 64, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { glow: { value: new THREE.Color('#e7a57c') } },
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 glow; varying vec3 vN; void main(){ float i = pow(0.68 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(glow, 1.0) * i; }',
      }),
    )
    scene.add(atmosphere)

    // Overlays
    const graticule = new THREE.LineSegments(buildGraticule(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16 }))
    scene.add(graticule)

    const orbit = new THREE.Group()
    const phobosRadius = 1.9
    const ringPts = Array.from({ length: 181 }, (_, i) => {
      const a = (i / 180) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a) * phobosRadius, 0, Math.sin(a) * phobosRadius)
    })
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.04, gapSize: 0.05, transparent: true, opacity: 0.35 }),
    )
    ring.computeLineDistances()
    const phobos = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
    orbit.add(ring, phobos)
    orbit.rotation.x = THREE.MathUtils.degToRad(1.1)
    scene.add(orbit)

    scene.add(new THREE.AmbientLight('#ffffff', 0.3))
    const sun = new THREE.DirectionalLight('#fff4e6', 2.6)
    sun.position.set(-2.5, 1.5, 2.2)
    camera.add(sun)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enabled = interactive
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 1.6
    controls.maxDistance = 8
    controls.rotateSpeed = 0.5
    controls.autoRotateSpeed = 0.6
    controls.addEventListener('start', () => { stateRef.current.focus = null })

    Object.assign(stateRef.current, { graticule, orbit })
    graticule.visible = stateRef.current.layers.grid
    orbit.visible = stateRef.current.layers.orbits

    // Cursor latitude / longitude readout
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const surfaceAt = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(globe)[0]
      if (!hit) return null
      const p = hit.point.clone().normalize()
      return { lat: THREE.MathUtils.radToDeg(Math.asin(p.y)), lon: THREE.MathUtils.radToDeg(Math.atan2(-p.z, p.x)) }
    }
    const onMove = (e: PointerEvent) => {
      const out = readoutRef.current
      if (!out) return
      const at = surfaceAt(e)
      out.textContent = at ? `${formatLat(at.lat)}  ${formatLon(at.lon)}` : ''
    }
    const onLeave = () => { if (readoutRef.current) readoutRef.current.textContent = '' }
    // A click is a press and release without dragging the globe
    let downAt: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : Infinity
      downAt = null
      if (moved > 4 || !onPickRef.current) return
      const at = surfaceAt(e)
      if (at) onPickRef.current(at.lat, at.lon)
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const timer = new THREE.Timer()
    const toCamera = new THREE.Vector3()
    const projected = new THREE.Vector3()
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      timer.update()
      const dt = timer.getDelta()
      const elapsed = timer.getElapsed()
      const { focus, layers: l, siteVectors } = stateRef.current

      if (focus) {
        // Swing around the planet on a great circle instead of cutting through it
        const k = 1 - Math.pow(0.03, dt)
        const dir = camera.position.clone().normalize()
        const turn = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(dir, focus.clone().normalize()), k)
        const length = THREE.MathUtils.lerp(camera.position.length(), CAMERA_DISTANCE * 0.9, k)
        camera.position.copy(dir.applyQuaternion(turn).setLength(length))
        if (camera.position.angleTo(focus) < 0.004) stateRef.current.focus = null
      }
      controls.autoRotate = l.rotate && !focus
      controls.update()

      phobos.position.set(Math.cos(elapsed * 0.35) * phobosRadius, 0, -Math.sin(elapsed * 0.35) * phobosRadius)

      const { clientWidth: w, clientHeight: h } = host
      for (const [id, v] of siteVectors) {
        const el = markerRefs.current.get(id)
        if (!el) continue
        toCamera.subVectors(camera.position, v)
        const visible = l.sites && toCamera.dot(v) > 0
        projected.copy(v).project(camera)
        el.style.transform = `translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`
        el.style.opacity = visible ? '1' : '0'
        el.style.pointerEvents = visible ? 'auto' : 'none'
      }
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      timer.dispose()
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose()
          m.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [interactive])

  useEffect(() => {
    stateRef.current.siteVectors = new Map(sites.map((s) => [s.id, latLonToVector(s.lat, s.lon, 1.005)]))
  }, [sites])

  useEffect(() => {
    const s = stateRef.current
    s.layers = layers
    if (s.graticule) s.graticule.visible = layers.grid
    if (s.orbit) s.orbit.visible = layers.orbits
  }, [layers])

  // Fly to a marker only when the selection changes, not when the marker list refreshes
  useEffect(() => {
    const site = sitesRef.current.find((s) => s.id === selectedId)
    if (site) stateRef.current.focus = latLonToVector(site.lat, site.lon)
  }, [selectedId])

  useEffect(() => {
    if (focus) stateRef.current.focus = latLonToVector(focus.lat, focus.lon)
  }, [focus])

  return (
    <div className={interactive ? 'globe-host' : 'globe-host is-preview'} ref={hostRef}>
      {interactive && (
        <>
          <div className="globe-markers">
            {sites.map((site) => (
              <button
                key={site.id}
                type="button"
                ref={(el) => { if (el) markerRefs.current.set(site.id, el); else markerRefs.current.delete(site.id) }}
                className={`site-marker${site.variant ? ` is-${site.variant}` : ''}${site.id === selectedId ? ' is-selected' : ''}`}
                onClick={() => onSelect?.(site.id)}
                aria-label={site.label}
              >
                <span className="site-marker-dot" />
                <span className="site-marker-label">{site.label}</span>
              </button>
            ))}
          </div>
          <div className="globe-readout" ref={readoutRef} aria-live="off" />
        </>
      )}
    </div>
  )
}
