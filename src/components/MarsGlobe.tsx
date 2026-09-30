import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { formatLat, formatLon } from '../data/mars'
import {
  daysSinceJ2000, inMarsShadow, MARS_RADIUS_KM, marsRotationDeg, MOON_RADII, moonOrbitPath, moonPosition, moonShadow, sunFromMars,
  type MoonId, type Vec3,
} from '../data/marsSky'
import { getMarsTextures } from './marsTexture'
import { buildMoonMaterial, getMoonGeometry, MOON_BOOST } from './moonModel'
import { addSurfaceDetail } from './surfaceDetail'

// Drop an equirectangular Mars map here to replace the procedural surface.
const TEXTURE_URL = '/resources/mars.jpg'
const CAMERA_DISTANCE = 4.4
/** How far behind a selected moon the camera parks (Mars radii), so both moons are framed alike. */
const MOON_VIEW_DISTANCE = 1.4
/** Arrival intro: the wide shot fits this radius (Deimos's orbit plus a margin), holds, then dollies in. */
const INTRO_FIT_RADIUS = 7.6
const INTRO_HOLD_MS = 1300
const INTRO_DOLLY_MS = 2200
const MOON_IDS: MoonId[] = ['phobos', 'deimos']
const MOON_COLORS: Record<MoonId, string> = { phobos: '#ffb489', deimos: '#9fd3ff' }

export type GlobeLayers = { grid: boolean; sites: boolean; moons: boolean; shadows: boolean }

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
  /** Plunge the camera toward the selected site, just before switching to its close-up. */
  dive?: boolean
  selectedMoon?: MoonId | null
  onSelectMoon?: (id: MoonId) => void
  /** Show the moons at their real size instead of enlarged. */
  trueScale?: boolean
  /** Arriving from the home page: open on a wide shot of Mars and both moon orbits, then glide in. */
  intro?: boolean
  /**
   * While the page animates the globe's box, the drawing size to hold (usually the window's), so the
   * picture is scaled instead of redrawn at a new size every frame. Null the rest of the time.
   */
  holdSize?: { w: number; h: number } | null
  /** Called once the intro has settled (or was cut short by the user), so the page can show its text. */
  onIntroDone?: () => void
}

type FocusTarget =
  | { kind: 'surface'; local: THREE.Vector3 }
  | { kind: 'moon'; id: MoonId }
  /** A camera distance along a fixed direction, for dollying in or out */
  | { kind: 'view'; dir: THREE.Vector3; distance: number }

function latLonToVector(lat: number, lon: number, radius = 1) {
  const la = THREE.MathUtils.degToRad(lat)
  const lo = THREE.MathUtils.degToRad(lon)
  return new THREE.Vector3(
    radius * Math.cos(la) * Math.cos(lo),
    radius * Math.sin(la),
    -radius * Math.cos(la) * Math.sin(lo),
  )
}

/** Mars-equatorial km (z north) to scene units (y north, Mars radius 1). */
function meiToScene(v: Vec3, out = new THREE.Vector3()) {
  return out.set(v[0], v[2], -v[1]).divideScalar(MARS_RADIUS_KM)
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

// Background stars on a far sphere: mostly faint, a few bright, with a denser band like the Milky Way.
function buildStarfield(pixelRatio: number) {
  const COUNT = 16000
  const BAND = 0.45
  const RADIUS = 60
  const positions = new Float32Array(COUNT * 3)
  const colors = new Float32Array(COUNT * 3)
  const sizes = new Float32Array(COUNT)
  const tints = [new THREE.Color('#9bb8ff'), new THREE.Color('#dfe7ff'), new THREE.Color('#ffffff'), new THREE.Color('#fff1d6'), new THREE.Color('#ffc98f')]
  const bandTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 0.3, 0.4))
  const v = new THREE.Vector3()
  for (let i = 0; i < COUNT; i++) {
    if (i < COUNT * BAND) {
      // Spread around a great circle, squashed toward it
      const a = Math.random() * Math.PI * 2
      const spread = (Math.random() - 0.5) * (Math.random() * 0.5)
      v.set(Math.cos(a), spread, Math.sin(a)).normalize().applyQuaternion(bandTilt)
    } else {
      v.randomDirection()
    }
    v.multiplyScalar(RADIUS).toArray(positions, i * 3)
    const bright = Math.pow(Math.random(), 5)
    tints[Math.floor(Math.random() * tints.length)].toArray(colors, i * 3)
    for (let c = 0; c < 3; c++) colors[i * 3 + c] *= 0.55 + bright * 0.45
    sizes[i] = (1.3 + bright * 3.2) * pixelRatio
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  const stars = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: 'attribute float size; varying vec3 vColor; void main(){ vColor = color; gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor * a, a); }',
    }),
  )
  stars.renderOrder = -1
  return stars
}

/** Soft dark spot for a moon's shadow; darkest at the centre by the share of the Sun that is covered. */
function buildShadowSpot() {
  return new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: { coverage: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float coverage; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, coverage * (1.0 - smoothstep(0.0, 1.0, r))); }',
    }),
  )
}

/** True when the planet hides point p from the camera. */
function behindPlanet(camera: THREE.Vector3, p: THREE.Vector3) {
  const d = p.clone().sub(camera)
  const t = THREE.MathUtils.clamp(-camera.dot(d) / d.lengthSq(), 0, 1)
  return t > 0 && t < 1 && camera.clone().addScaledVector(d, t).length() < 1
}

const NO_SITES: GlobeMarker[] = []

export function MarsGlobe({
  sites = NO_SITES, selectedId = null, layers, onSelect, interactive = true, onPick, focus = null, dive = false,
  selectedMoon = null, onSelectMoon, trueScale = false, intro = false, onIntroDone, holdSize = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  // False until the shaders are compiled, so the globe fades in instead of freezing on its first frame
  const [ready, setReady] = useState(false)
  const onPickRef = useRef(onPick)
  const onIntroDoneRef = useRef(onIntroDone)
  const introRef = useRef(intro)
  const resizeRef = useRef<() => void>(() => {})
  const sitesRef = useRef(sites)
  useEffect(() => {
    onPickRef.current = onPick
    onIntroDoneRef.current = onIntroDone
    sitesRef.current = sites
  })
  const readoutRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef(new Map<string, HTMLButtonElement>())
  const moonMarkerRefs = useRef(new Map<MoonId, HTMLButtonElement>())
  const shadowMarkerRefs = useRef(new Map<MoonId, HTMLSpanElement>())
  const stateRef = useRef({
    layers,
    trueScale,
    selectedId,
    selectedMoon,
    holdSize,
    focus: null as FocusTarget | null,
    diving: false,
    graticule: null as THREE.Object3D | null,
    siteVectors: new Map<string, THREE.Vector3>(),
  })

  useEffect(() => {
    const host = hostRef.current!
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 120)
    scene.add(camera)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    // Set once every shader has compiled in the background (see compileAsync below); nothing is drawn before
    let compiled = false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.prepend(renderer.domElement)

    // Everything fixed to the ground turns with the planet
    const planet = new THREE.Group()
    scene.add(planet)

    // Surface
    const procedural = getMarsTextures()
    const colorMap = new THREE.CanvasTexture(procedural.color)
    colorMap.colorSpace = THREE.SRGBColorSpace
    colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const bumpMap = new THREE.CanvasTexture(procedural.bump)
    const material = new THREE.MeshStandardMaterial({ map: colorMap, bumpMap, bumpScale: 2.2, roughness: 0.95, metalness: 0 })
    addSurfaceDetail(material, { scale: 24, color: 0.55, relief: 0.012 })
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), material)
    planet.add(globe)

    scene.add(buildStarfield(renderer.getPixelRatio()))

    new THREE.TextureLoader().load(TEXTURE_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      material.map = tex
      material.bumpScale = 0.6
      material.needsUpdate = true
      colorMap.dispose()
    }, undefined, () => { /* no custom texture; keep the procedural one */ })

    // Thin dusty atmosphere rim, brighter on the sunlit limb
    const atmosphereUniforms = { glow: { value: new THREE.Color('#e7a57c') }, sunView: { value: new THREE.Vector3(0, 0, 1) } }
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.07, 64, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: atmosphereUniforms,
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 glow; uniform vec3 sunView; varying vec3 vN; void main(){ float i = pow(0.68 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); float lit = 0.3 + 0.7 * smoothstep(-0.35, 0.35, dot(vN, sunView)); gl_FragColor = vec4(glow, 1.0) * i * lit; }',
      }),
    )
    scene.add(atmosphere)

    // Overlays
    const graticule = new THREE.LineSegments(buildGraticule(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16 }))
    planet.add(graticule)

    // Real sunlight from the Sun's actual direction; a little ambient keeps the night side readable
    scene.add(new THREE.AmbientLight('#ffffff', 0.14))
    const sun = new THREE.DirectionalLight('#fff4e6', 2.8)
    scene.add(sun)

    // Moons, their orbits and their shadows on the ground
    const moonLayer = new THREE.Group()
    const shadowLayer = new THREE.Group()
    scene.add(moonLayer, shadowLayer)
    const moons = MOON_IDS.map((id) => {
      const mat = buildMoonMaterial(id)
      const mesh = new THREE.Mesh(getMoonGeometry(id), mat)
      const orbitLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: MOON_COLORS[id], transparent: true, opacity: 0.35 }))
      const spot = buildShadowSpot()
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1, 64),
        new THREE.MeshBasicMaterial({ color: MOON_COLORS[id], transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      )
      moonLayer.add(mesh, orbitLine)
      shadowLayer.add(spot, ring)
      return { id, mesh, baseColor: mat.color.clone(), orbitLine, pathDay: NaN, spot, ring, world: new THREE.Vector3(), shadowWorld: null as THREE.Vector3 | null }
    })

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enabled = interactive
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 1.6
    controls.maxDistance = 24
    controls.rotateSpeed = 0.5
    // Arrival intro: hidden until drawable, hold the wide shot, dolly in, then tell the page it has landed
    let introPhase: 'off' | 'waiting' | 'hold' | 'dolly' | 'done' = introRef.current ? 'waiting' : 'off'
    let introAt = 0
    const finishIntro = () => {
      if (introPhase === 'off' || introPhase === 'done') return
      introPhase = 'done'
      onIntroDoneRef.current?.()
    }

    let dragging = false
    controls.addEventListener('start', () => {
      stateRef.current.focus = null
      dragging = true
      // Grabbing the globe mid-intro ends it, so the page never stays without its text
      finishIntro()
    })
    controls.addEventListener('end', () => { dragging = false })

    Object.assign(stateRef.current, { graticule })
    graticule.visible = stateRef.current.layers.grid

    // Scene state for a moment in simulated time
    const sunScene = new THREE.Vector3()
    const place = (ms: number) => {
      const d = daysSinceJ2000(ms)
      const sunNow = sunFromMars(d)
      meiToScene(sunNow.dir, sunScene).normalize()
      sun.position.copy(sunScene).multiplyScalar(10)
      planet.rotation.y = THREE.MathUtils.degToRad(marsRotationDeg(d))
      planet.updateMatrixWorld()

      const s = stateRef.current
      for (const m of moons) {
        const pos = moonPosition(m.id, d)
        meiToScene(pos, m.world)
        m.mesh.position.copy(m.world)
        m.mesh.lookAt(0, 0, 0) // tidally locked: the long axis always points at Mars
        m.mesh.scale.setScalar((s.trueScale ? 1 : MOON_BOOST) / MARS_RADIUS_KM)
        // A moon inside Mars's shadow goes dark (an eclipse of the Sun as seen from the moon)
        m.mesh.material.color.copy(m.baseColor).multiplyScalar(inMarsShadow(pos, sunNow.dir) ? 0.05 : 1)
        if (!(Math.abs(d - m.pathDay) < 1)) {
          // The orbits slowly precess, so redraw them now and then
          m.orbitLine.geometry.dispose()
          m.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(moonOrbitPath(m.id, d).map((p) => meiToScene(p)))
          m.pathDay = d
        }

        const shadow = moonShadow(m.id, d, sunNow.dir, sunNow.au, pos)
        m.spot.visible = m.ring.visible = !!shadow
        m.shadowWorld = null
        if (!shadow) continue
        const n = meiToScene(shadow.center).normalize()
        // Stretch the spot along the ground toward the Sun, as a slanting shadow does
        const cosIncidence = Math.max(0.15, n.dot(sunScene))
        const toward = sunScene.clone().addScaledVector(n, -n.dot(sunScene))
        if (toward.lengthSq() < 1e-8) toward.set(0, 1, 0).addScaledVector(n, -n.y)
        toward.normalize()
        const basis = new THREE.Matrix4().makeBasis(toward, new THREE.Vector3().crossVectors(n, toward), n)
        const r = shadow.radiusKm / MARS_RADIUS_KM
        for (const obj of [m.spot, m.ring]) {
          obj.position.copy(n).multiplyScalar(1.0015)
          obj.quaternion.setFromRotationMatrix(basis)
        }
        m.spot.scale.set(r / cosIncidence, r, 1)
        ;(m.spot.material as THREE.ShaderMaterial).uniforms.coverage.value = shadow.coverage
        // The real shadow is only tens of km wide; the ring keeps it findable from far away
        const ringSize = Math.max(r * 1.6, 0.02)
        m.ring.scale.set(ringSize, ringSize, 1)
        m.shadowWorld = n
      }
    }

    // Start with the camera over the sunlit side
    place(Date.now())
    camera.position.copy(sunScene).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.7).setY(0.35).setLength(CAMERA_DISTANCE)

    // Cursor latitude / longitude readout
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const surfaceAt = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(globe)[0]
      if (!hit) return null
      const p = planet.worldToLocal(hit.point.clone()).normalize()
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

    // Where the drawn picture sits in the host: normally the whole host, but see holdSize below
    const view = { x: 0, w: 1, h: 1 }
    let buffer = { w: 0, h: 0 }
    const setBuffer = (w: number, h: number) => {
      if (buffer.w === w && buffer.h === h) return
      buffer = { w, h }
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      const hold = stateRef.current.holdSize
      const canvas = renderer.domElement
      if (hold && h > 0) {
        // While the page animates the globe between full screen and its frame, resizing the drawing
        // buffer every frame is slow enough to stall the animation. Keep the full-screen buffer and scale
        // the picture to the host's height, centred and trimmed at the sides: with a fixed vertical field
        // of view that is exactly how the planet looks when drawn at the host's own size.
        setBuffer(hold.w, hold.h)
        const k = h / hold.h
        Object.assign(view, { x: (w - hold.w * k) / 2, w: hold.w * k, h })
        Object.assign(canvas.style, { position: 'absolute', width: `${hold.w}px`, height: `${hold.h}px`, transformOrigin: '0 0', transform: `translate(${view.x}px, 0) scale(${k})` })
      } else {
        setBuffer(w, h)
        Object.assign(view, { x: 0, w, h })
        Object.assign(canvas.style, { position: '', width: '', height: '', transformOrigin: '', transform: '' })
      }
      // Resizing wipes the canvas, and this runs after the frame was drawn but before it reaches the
      // screen; redraw now, or the globe blinks out
      if (compiled) renderer.render(scene, camera)
    }
    resizeRef.current = resize
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()
    // The intro opens far enough out to fit Deimos's orbit across the frame, whatever its shape
    if (introPhase === 'waiting') {
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1.8)
      camera.position.setLength(Math.min(controls.maxDistance, INTRO_FIT_RADIUS / halfWidth + 1.2))
    }

    const projected = new THREE.Vector3()
    const world = new THREE.Vector3()
    const turn = new THREE.Quaternion()
    let followPrev: THREE.Vector3 | null = null
    // The camera flight under way: where it set off from, and when
    let flight: { target: FocusTarget; fromDir: THREE.Vector3; fromLength: number; start: number; duration: number } | null = null
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const worldOf = (target: FocusTarget) =>
      target.kind === 'moon' ? moons.find((m) => m.id === target.id)!.world.clone()
        : target.kind === 'view' ? target.dir.clone().multiplyScalar(target.distance)
          : target.local.clone().applyMatrix4(planet.matrixWorld)

    // Position an HTML marker over a world point; hidden when off to the side, behind the planet or switched off
    const pin = (el: HTMLElement, p: THREE.Vector3, show: boolean) => {
      projected.copy(p).project(camera)
      const visible = show && projected.z < 1 && !behindPlanet(camera.position, p)
      el.style.transform = `translate(${view.x + ((projected.x + 1) / 2) * view.w}px, ${((1 - projected.y) / 2) * view.h}px)`
      el.style.opacity = visible ? '1' : '0'
      el.style.pointerEvents = visible && el.tagName === 'BUTTON' ? 'auto' : 'none'
    }

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const now = performance.now()
      const s = stateRef.current
      const { diving, layers: l, siteVectors } = s
      place(Date.now())

      // Keep the selected moon or site in view while the planet turns and the moons move
      const followed: FocusTarget | null = s.selectedMoon
        ? { kind: 'moon', id: s.selectedMoon }
        : s.selectedId && siteVectors.has(s.selectedId) ? { kind: 'surface', local: siteVectors.get(s.selectedId)! } : null
      const followDir = followed ? worldOf(followed).normalize() : null
      if (followDir && followPrev && !dragging && !s.focus) camera.position.applyQuaternion(turn.setFromUnitVectors(followPrev, followDir))
      followPrev = followDir

      // After holding the wide shot, glide straight in to the usual viewing distance
      if (introPhase === 'hold' && now - introAt > INTRO_HOLD_MS) {
        s.focus = { kind: 'view', dir: camera.position.clone().normalize(), distance: CAMERA_DISTANCE }
        introPhase = 'dolly'
      }

      // A dive drops the camera almost to the surface, so let it past the usual zoom limit
      controls.minDistance = diving ? 1.1 : 1.6
      if (!s.focus) flight = null
      else {
        const target = worldOf(s.focus)
        const toDir = target.clone().normalize()
        if (flight?.target !== s.focus) {
          // New destination: set off from wherever the camera is, taking longer for wider swings
          const fromDir = camera.position.clone().normalize()
          const duration = reducedMotion ? 0 : diving ? 1300 : s.focus.kind === 'view' ? INTRO_DOLLY_MS : 1100 + 900 * (fromDir.angleTo(toDir) / Math.PI)
          flight = { target: s.focus, fromDir, fromLength: camera.position.length(), start: now, duration }
        }
        const t = flight.duration ? Math.min(1, (now - flight.start) / flight.duration) : 1
        // Ease in and out so the camera neither jolts off nor snaps to a stop
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        const goal = diving ? 1.15
          : s.focus.kind === 'moon' ? target.length() + MOON_VIEW_DISTANCE
            : s.focus.kind === 'view' ? s.focus.distance
              : CAMERA_DISTANCE * 0.9
        // Swing around the planet on a great circle toward where the target is now (moons keep moving)
        const swing = new THREE.Quaternion().setFromUnitVectors(flight.fromDir, toDir)
        const dir = flight.fromDir.clone().applyQuaternion(new THREE.Quaternion().slerp(swing, e))
        // Pull out a little mid-flight on long swings, like a camera crane, then settle in
        const lift = diving ? 0 : Math.sin(Math.PI * e) * 0.4 * flight.fromDir.angleTo(toDir)
        camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flight.fromLength, goal, e) + lift))
        if (t >= 1 && !diving) s.focus = null
      }
      // Landed (or another flight took over): the page can bring in its text
      if (introPhase === 'dolly' && s.focus?.kind !== 'view') finishIntro()
      controls.update()
      atmosphereUniforms.sunView.value.copy(sunScene).transformDirection(camera.matrixWorldInverse)

      const { h } = view
      for (const [id, v] of siteVectors) {
        const el = markerRefs.current.get(id)
        if (!el) continue
        world.copy(v).applyMatrix4(planet.matrixWorld)
        // Sites are on the surface: visible on the hemisphere facing the camera
        const facing = world.dot(camera.position.clone().sub(world)) > 0
        pin(el, world, l.sites && facing)
      }
      moonLayer.visible = l.moons
      shadowLayer.visible = l.shadows
      for (const m of moons) {
        const label = moonMarkerRefs.current.get(m.id)
        if (label) {
          pin(label, m.world, l.moons)
          // Lift the label clear of the moon, however large it appears on screen
          const radius = MOON_RADII[m.id][0] * m.mesh.scale.x
          const px = (radius / (camera.position.distanceTo(m.world) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (h / 2)
          label.style.marginTop = `${-Math.min(px, h / 3) - 28}px`
        }
        const shadowLabel = shadowMarkerRefs.current.get(m.id)
        if (shadowLabel) {
          const facing = !!m.shadowWorld && m.shadowWorld.dot(camera.position.clone().sub(m.shadowWorld)) > 0
          pin(shadowLabel, m.shadowWorld ?? m.world, l.shadows && facing)
        }
      }
      if (!compiled) return
      renderer.render(scene, camera)
      // The first draws still finish some GPU setup; reveal the globe only once they are done,
      // so its entrance animation plays smoothly instead of stalling on its opening frames
      if (++framesDrawn === 3) {
        setReady(true)
        if (introPhase === 'waiting') {
          introPhase = 'hold'
          introAt = now
        }
      }
    }

    // Compile every shader in the background first. Drawing straight away makes the browser wait for the
    // graphics driver to compile them, which froze the page for a moment just as the globe arrived.
    let disposed = false
    let framesDrawn = 0
    renderer.compileAsync(scene, camera).catch(() => { /* draw anyway; the first frame compiles what is left */ }).then(() => {
      if (disposed) return
      renderer.initTexture(colorMap)
      renderer.initTexture(bumpMap)
      compiled = true
    })
    tick()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
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
  }, [layers])

  useEffect(() => {
    Object.assign(stateRef.current, { trueScale, selectedId, selectedMoon })
  }, [trueScale, selectedId, selectedMoon])

  // Before paint, so the first frame of the page's animation already shows the held picture
  useLayoutEffect(() => {
    stateRef.current.holdSize = holdSize
    resizeRef.current()
  }, [holdSize])

  // Fly to a marker only when the selection changes, not when the marker list refreshes
  useEffect(() => {
    const site = sitesRef.current.find((s) => s.id === selectedId)
    if (site) stateRef.current.focus = { kind: 'surface', local: latLonToVector(site.lat, site.lon) }
  }, [selectedId])

  useEffect(() => {
    if (selectedMoon) stateRef.current.focus = { kind: 'moon', id: selectedMoon }
  }, [selectedMoon])

  useEffect(() => {
    if (focus) stateRef.current.focus = { kind: 'surface', local: latLonToVector(focus.lat, focus.lon) }
  }, [focus])

  useEffect(() => {
    const s = stateRef.current
    s.diving = dive
    const site = sitesRef.current.find((m) => m.id === selectedId)
    if (dive && site) s.focus = { kind: 'surface', local: latLonToVector(site.lat, site.lon) }
  }, [dive, selectedId])

  return (
    <div className={`globe-host${interactive ? '' : ' is-preview'}${ready ? ' is-ready' : ''}`} ref={hostRef}>
      {interactive && (
        <>
          <div className="globe-markers">
            {MOON_IDS.map((id) => (
              <span
                key={`${id}-shadow`}
                ref={(el) => { if (el) shadowMarkerRefs.current.set(id, el); else shadowMarkerRefs.current.delete(id) }}
                className={`shadow-marker is-${id}`}
              >
                {id === 'phobos' ? 'Phobos' : 'Deimos'} shadow
              </span>
            ))}
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
            {MOON_IDS.map((id) => (
              <button
                key={id}
                type="button"
                ref={(el) => { if (el) moonMarkerRefs.current.set(id, el); else moonMarkerRefs.current.delete(id) }}
                className={`moon-marker is-${id}${id === selectedMoon ? ' is-selected' : ''}`}
                onClick={() => onSelectMoon?.(id)}
              >
                {id === 'phobos' ? 'Phobos' : 'Deimos'}
              </button>
            ))}
          </div>
          <div className="globe-readout" ref={readoutRef} aria-live="off" />
        </>
      )}
    </div>
  )
}
