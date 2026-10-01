import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { formatLat, formatLon } from '../data/mars'
import {
  daysSinceJ2000, MARS_RADIUS_KM, marsRotationDeg, MOON_RADII, moonOrbitPath, sunFromMars, sunVisibleFromMoon,
  type MoonId, type Vec3,
} from '../data/marsSky'
import { ensureMoonEphemeris, ephemerisVersion, livePosition } from '../data/moonEphemeris'
import { getMarsTextures } from './marsTexture'
import { loadMarsModel } from './marsModel'
import { buildMoonMaterial, getPlaceholderGeometry, loadMoonGeometry } from './moonModel'
import { addSurfaceDetail } from './surfaceDetail'

const CAMERA_DISTANCE = 4.4
// How long the globe waits for NASA's Mars model before showing the generated planet instead
const MODEL_WAIT_MS = 8000
/**
 * Flying to a moon: one continuous move that turns to face the moon and closes in on the side the camera
 * sees, until it is MOON_CLOSE_RADII of the moon's long radius from its centre, where it can orbit the moon.
 */
const MOON_CLOSE_RADII = 7
const APPROACH_MS = 2600
/** The arrival view turns at most this far (radians) off the clicked-from side, toward the sunlit face. */
const APPROACH_MAX_TURN = Math.PI / 4
/** A flight path to a moon keeps at least this far (Mars radii) from Mars's centre, clear of the atmosphere. */
const APPROACH_CLEARANCE = 1.35
const TARGET_BACK_MS = 1300
/** Arrival intro: the wide shot fits this radius (Deimos's orbit plus a margin), holds, then dollies in. */
const INTRO_FIT_RADIUS = 7.6
const INTRO_HOLD_MS = 1300
const INTRO_DOLLY_MS = 2200
const MOON_IDS: MoonId[] = ['phobos', 'deimos']
const MOON_COLORS: Record<MoonId, string> = { phobos: '#ffb489', deimos: '#9fd3ff' }

/** labels: site dots and names plus moon names; orbits: the moons' orbit lines. */
export type GlobeLayers = { labels: boolean; orbits: boolean; grid: boolean }

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
  /** Arriving from the home page: open on a wide shot of Mars and both moon orbits, then glide in. */
  intro?: boolean
  /** Stop drawing (the landing-site close-up is covering the globe); the camera stays where it is. */
  paused?: boolean
  /** Change this number to glide the camera back to its opening view. */
  resetKey?: number
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

/**
 * The Sun as seen from Mars: a small white-hot disk (it looks about two-thirds the size it does from
 * Earth) in a soft glow. Placed far off in the Sun's real direction, behind the planet and moons.
 */
function buildSunSprite() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.035, 'rgba(255, 252, 240, 1)')
  g.addColorStop(0.05, 'rgba(255, 236, 200, 0.55)')
  g.addColorStop(0.18, 'rgba(255, 214, 160, 0.16)')
  g.addColorStop(0.45, 'rgba(255, 190, 130, 0.04)')
  g.addColorStop(1, 'rgba(255, 180, 120, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  sprite.renderOrder = -0.5
  return sprite
}
/** How far off the Sun sprite sits (inside the star sphere) and how wide its glow is, in scene units. */
const SUN_SPRITE_DISTANCE = 55
const SUN_SPRITE_SIZE = 16

/** True when the planet hides point p from the camera. */
function behindPlanet(camera: THREE.Vector3, p: THREE.Vector3) {
  const d = p.clone().sub(camera)
  const t = THREE.MathUtils.clamp(-camera.dot(d) / d.lengthSq(), 0, 1)
  return t > 0 && t < 1 && camera.clone().addScaledVector(d, t).length() < 1
}

const NO_SITES: GlobeMarker[] = []

export function MarsGlobe({
  sites = NO_SITES, selectedId = null, layers, onSelect, interactive = true, onPick, focus = null, dive = false,
  selectedMoon = null, onSelectMoon, intro = false, onIntroDone, resetKey = 0, paused = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  // False until the shaders are compiled, so the globe fades in instead of freezing on its first frame
  const [ready, setReady] = useState(false)
  const onPickRef = useRef(onPick)
  const onIntroDoneRef = useRef(onIntroDone)
  const introRef = useRef(intro)
  const sitesRef = useRef(sites)
  useEffect(() => {
    onPickRef.current = onPick
    onIntroDoneRef.current = onIntroDone
    sitesRef.current = sites
  })
  const readoutRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef(new Map<string, HTMLButtonElement>())
  const moonMarkerRefs = useRef(new Map<MoonId, HTMLButtonElement>())
  const stateRef = useRef({
    layers,
    selectedId,
    selectedMoon,
    /** The opening camera direction, for Reset view */
    homeDir: null as THREE.Vector3 | null,
    paused,
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

    // Surface: NASA's Mars model (see marsModel.ts), swapped in below once loaded. A generated planet
    // stands in until then, and stays if the model can't be loaded.
    const procedural = getMarsTextures()
    const colorMap = new THREE.CanvasTexture(procedural.color)
    colorMap.colorSpace = THREE.SRGBColorSpace
    colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const bumpMap = new THREE.CanvasTexture(procedural.bump)
    const material = new THREE.MeshStandardMaterial({ map: colorMap, bumpMap, bumpScale: 2.2, roughness: 0.95, metalness: 0 })
    addSurfaceDetail(material, { scale: 24, color: 0.55, relief: 0.012 })
    const globe: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), material)
    planet.add(globe)

    scene.add(buildStarfield(renderer.getPixelRatio()))

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

    // Real sunlight from the Sun's actual direction; a little ambient keeps the night side readable.
    // Its shadow map is fitted around one moon at a time (see tick), so craters cast real shadows.
    scene.add(new THREE.AmbientLight('#ffffff', 0.14))
    const sun = new THREE.DirectionalLight('#fff4e6', 2.8)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    scene.add(sun, sun.target)

    // The Sun itself, far off in its real direction behind everything else
    const sunDisk = buildSunSprite()
    scene.add(sunDisk)

    // Moons and their orbits
    const moonLayer = new THREE.Group()
    scene.add(moonLayer)
    const moons = MOON_IDS.map((id) => {
      // A plain ellipsoid until the measured shape has downloaded (it usually has, from the home page)
      const mesh = new THREE.Mesh(getPlaceholderGeometry(id), buildMoonMaterial())
      loadMoonGeometry(id).then((shape) => { mesh.geometry = shape }).catch(() => { /* keep the ellipsoid */ })
      mesh.castShadow = true
      mesh.receiveShadow = true
      const orbitLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: MOON_COLORS[id], transparent: true, opacity: 0.35 }))
      moonLayer.add(mesh, orbitLine)
      return { id, mesh, orbitLine, pathDay: NaN, world: new THREE.Vector3() }
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
    let ephemerisDrawn = ephemerisVersion()
    const place = (ms: number) => {
      const d = daysSinceJ2000(ms)
      const sunNow = sunFromMars(d)
      meiToScene(sunNow.dir, sunScene).normalize()
      planet.rotation.y = THREE.MathUtils.degToRad(marsRotationDeg(d))
      planet.updateMatrixWorld()
      // Moons from JPL Horizons once loaded; redraw the orbit lines when new positions arrive
      ensureMoonEphemeris(ms)
      const redrawOrbits = ephemerisDrawn !== ephemerisVersion()
      ephemerisDrawn = ephemerisVersion()
      for (const m of moons) {
        const pos = livePosition(m.id, d)
        meiToScene(pos, m.world)
        m.mesh.position.copy(m.world)
        m.mesh.lookAt(0, 0, 0) // tidally locked: the long axis always points at Mars
        m.mesh.scale.setScalar(1 / MARS_RADIUS_KM) // true size: the geometry is in km
        // In Mars's shadow the moon darkens, fading through the penumbra rather than switching off
        m.mesh.material.color.setScalar(Math.max(0.015, sunVisibleFromMoon(pos, sunNow.dir, sunNow.au)))
        if (redrawOrbits || !(Math.abs(d - m.pathDay) < 1)) {
          // The orbits slowly precess, so redraw them now and then
          m.orbitLine.geometry.dispose()
          m.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(moonOrbitPath(m.id, d, 256, livePosition).map((p) => meiToScene(p)))
          m.pathDay = d
        }
      }
    }

    // Start with the camera over the sunlit side
    place(Date.now())
    camera.position.copy(sunScene).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.7).setY(0.35).setLength(CAMERA_DISTANCE)
    stateRef.current.homeDir = camera.position.clone().normalize()

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

    // The drawn picture's size, for placing the HTML markers over it
    const view = { w: 1, h: 1 }
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (w === view.w && h === view.h) return
      Object.assign(view, { w, h })
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      // Resizing wipes the canvas, and this runs after the frame was drawn but before it reaches the
      // screen; redraw now, or the globe blinks out
      if (compiled) renderer.render(scene, camera)
    }
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
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    // Up close to a moon the camera orbits the moon, not Mars: the orbit centre rides along with it
    let moonMode: MoonId | null = null
    // Flying in to a moon: the view turns onto the moon while the camera closes in on its near side.
    // `bump` bends the path out around Mars when the moon is on the far side of the planet.
    let approach: {
      id: MoonId; start: number; fromTarget: THREE.Vector3
      fromDir: THREE.Vector3; toDir: THREE.Vector3; fromLength: number; bump: THREE.Vector3
    } | null = null
    // Camera position on a moon approach at progress e, before any bend around Mars
    const approachPoint = (a: NonNullable<typeof approach>, moonWorld: THREE.Vector3, e: number) => {
      // Distance shrinks geometrically, so the last few kilometres don't rush past
      const length = a.fromLength * Math.pow(closeDistance(a.id) / a.fromLength, e)
      const dir = a.fromDir.clone().lerp(a.toDir, e).normalize()
      return dir.multiplyScalar(length).add(moonWorld)
    }
    const startApproach = (id: MoonId, now: number) => {
      const m = moonOf(id)
      const fromDir = camera.position.clone().sub(m.world).normalize()
      // Arrive on the side you clicked from, turned toward the Sun just enough that the light rakes
      // across it: craters and grooves throw shadows instead of the face sitting in the dark
      const across = fromDir.clone().addScaledVector(sunScene, -fromDir.dot(sunScene))
      if (across.lengthSq() < 1e-6) across.set(0, 1, 0)
      const lit = sunScene.clone().multiplyScalar(0.5).addScaledVector(across.normalize(), Math.sqrt(3) / 2)
      const turnBy = Math.min(fromDir.angleTo(lit), APPROACH_MAX_TURN)
      const axis = fromDir.clone().cross(lit)
      const toDir = axis.lengthSq() < 1e-9 ? fromDir.clone() : fromDir.clone().applyAxisAngle(axis.normalize(), turnBy)
      const a = { id, start: now, fromTarget: controls.target.clone(), fromDir, toDir, fromLength: camera.position.distanceTo(m.world), bump: new THREE.Vector3() }
      // If the straight run in would graze Mars, bow the path outward at its closest point
      let closest = Infinity
      let closestAt = 0.5
      const at = new THREE.Vector3()
      for (let i = 1; i < 32; i++) {
        const p = approachPoint(a, m.world, i / 32)
        if (p.length() < closest) {
          closest = p.length()
          closestAt = i / 32
          at.copy(p)
        }
      }
      if (closest < APPROACH_CLEARANCE) {
        const out = at.lengthSq() > 1e-6 ? at.clone().normalize() : a.fromDir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
        a.bump.copy(out).multiplyScalar(((APPROACH_CLEARANCE - closest) * 1.2) / Math.max(0.3, Math.sin(Math.PI * closestAt)))
      }
      approach = a
      targetBack = null
    }
    // Leaving a moon: the orbit centre glides back to Mars
    let targetBack: { from: THREE.Vector3; start: number } | null = null
    const moonOf = (id: MoonId) => moons.find((m) => m.id === id)!
    const closeDistance = (id: MoonId) => (MOON_RADII[id][0] * MOON_CLOSE_RADII) / MARS_RADIUS_KM
    const leaveMoon = (now: number) => {
      moonMode = null
      approach = null
      if (controls.target.lengthSq() > 1e-12 && !targetBack) targetBack = { from: controls.target.clone(), start: now }
    }

    const worldOf = (target: FocusTarget) =>
      target.kind === 'moon' ? moons.find((m) => m.id === target.id)!.world.clone()
        : target.kind === 'view' ? target.dir.clone().multiplyScalar(target.distance)
          : target.local.clone().applyMatrix4(planet.matrixWorld)

    // Position an HTML marker over a world point; hidden when off to the side, behind the planet or switched off
    const pin = (el: HTMLElement, p: THREE.Vector3, show: boolean) => {
      projected.copy(p).project(camera)
      const visible = show && projected.z < 1 && !behindPlanet(camera.position, p)
      el.style.transform = `translate(${((projected.x + 1) / 2) * view.w}px, ${((1 - projected.y) / 2) * view.h}px)`
      el.style.opacity = visible ? '1' : '0'
      el.style.pointerEvents = visible && el.tagName === 'BUTTON' ? 'auto' : 'none'
    }

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const now = performance.now()
      const s = stateRef.current
      const { diving, layers: l, siteVectors } = s
      // Hidden under the landing-site close-up: skip all work; the camera waits where the dive left it
      if (s.paused) return
      place(Date.now())

      // Up close to a moon: carry the camera and its orbit centre along with the moon as it travels.
      // Deselecting it (or picking something else) pulls the camera back out to Mars.
      if (moonMode) {
        if (s.selectedMoon !== moonMode || s.focus) {
          leaveMoon(now)
          if (!s.focus) s.focus = { kind: 'view', dir: camera.position.clone().normalize(), distance: CAMERA_DISTANCE }
        } else {
          const delta = moonOf(moonMode).world.clone().sub(controls.target)
          controls.target.add(delta)
          camera.position.add(delta)
        }
      }

      // Keep a selected site in view while the planet turns under the camera
      const followed: FocusTarget | null = s.selectedId && siteVectors.has(s.selectedId) ? { kind: 'surface', local: siteVectors.get(s.selectedId)! } : null
      const followDir = followed ? worldOf(followed).normalize() : null
      if (followDir && followPrev && !dragging && !s.focus) camera.position.applyQuaternion(turn.setFromUnitVectors(followPrev, followDir))
      followPrev = followDir

      // After holding the wide shot, glide straight in to the usual viewing distance
      if (introPhase === 'hold' && now - introAt > INTRO_HOLD_MS) {
        s.focus = { kind: 'view', dir: camera.position.clone().normalize(), distance: CAMERA_DISTANCE }
        introPhase = 'dolly'
      }

      // A moon picked: fly straight in to it rather than swinging round Mars first
      if (s.focus?.kind === 'moon') {
        leaveMoon(now)
        if (s.selectedMoon === s.focus.id) startApproach(s.focus.id, now)
        s.focus = null
      }

      if (!s.focus) flight = null
      else {
        const target = worldOf(s.focus)
        const toDir = target.clone().normalize()
        if (flight?.target !== s.focus) {
          // New destination: set off from wherever the camera is, taking longer for wider swings
          const fromDir = camera.position.clone().normalize()
          const duration = reducedMotion ? 0 : diving ? 1300 : s.focus.kind === 'view' && introPhase === 'dolly' ? INTRO_DOLLY_MS : 1100 + 900 * (fromDir.angleTo(toDir) / Math.PI)
          flight = { target: s.focus, fromDir, fromLength: camera.position.length(), start: now, duration }
          leaveMoon(now)
        }
        const t = flight.duration ? Math.min(1, (now - flight.start) / flight.duration) : 1
        // Ease in and out so the camera neither jolts off nor snaps to a stop
        const e = ease(t)
        const goal = diving ? 1.15 : s.focus.kind === 'view' ? s.focus.distance : CAMERA_DISTANCE * 0.9
        // Swing around the planet on a great circle toward where the target is now (moons keep moving)
        const swing = new THREE.Quaternion().setFromUnitVectors(flight.fromDir, toDir)
        const dir = flight.fromDir.clone().applyQuaternion(new THREE.Quaternion().slerp(swing, e))
        // Pull out a little mid-flight on long swings, like a camera crane, then settle in
        const lift = diving ? 0 : Math.sin(Math.PI * e) * 0.4 * flight.fromDir.angleTo(toDir)
        camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flight.fromLength, goal, e) + lift))
        if (t >= 1 && !diving) s.focus = null
      }

      // Flying in to a moon: the view turns onto it early, so it sits centred while the camera closes in
      if (approach) {
        if (s.selectedMoon !== approach.id) {
          leaveMoon(now)
          s.focus ??= { kind: 'view', dir: camera.position.clone().normalize(), distance: CAMERA_DISTANCE }
        } else {
          const m = moonOf(approach.id)
          const t = reducedMotion ? 1 : Math.min(1, (now - approach.start) / APPROACH_MS)
          const e = ease(t)
          controls.target.lerpVectors(approach.fromTarget, m.world, ease(Math.min(1, t / 0.6)))
          camera.position.copy(approachPoint(approach, m.world, e)).addScaledVector(approach.bump, Math.sin(Math.PI * e))
          if (t >= 1) {
            moonMode = approach.id
            approach = null
          }
        }
      }
      if (targetBack) {
        const t = reducedMotion ? 1 : Math.min(1, (now - targetBack.start) / TARGET_BACK_MS)
        controls.target.lerpVectors(targetBack.from, new THREE.Vector3(), ease(t))
        if (t >= 1) targetBack = null
      }

      // Zoom limits: close to a moon, the camera may come within 60% of its long radius above the surface;
      // while the orbit centre is moving, no limit, or the controls would yank the camera
      if (moonMode) {
        controls.minDistance = (MOON_RADII[moonMode][0] * 1.6) / MARS_RADIUS_KM
        controls.maxDistance = 0.6
      } else {
        // A dive, or the zoom back out of one, runs the camera below the usual zoom limit
        controls.minDistance = approach || targetBack ? 0 : diving || s.focus ? 1.1 : 1.6
        controls.maxDistance = 24
      }
      controls.enabled = interactive && !approach

      // Near clipping plane follows the nearest surface, so a moon seen from a few km stays whole
      let nearest = camera.position.length() - 1.08
      for (const m of moons) nearest = Math.min(nearest, camera.position.distanceTo(m.world) - MOON_RADII[m.id][0] / MARS_RADIUS_KM)
      const near = THREE.MathUtils.clamp(nearest * 0.4, 0.0005, 0.05)
      if (Math.abs(near - camera.near) > camera.near * 0.1) {
        camera.near = near
        camera.updateProjectionMatrix()
      }
      // Landed (or another flight took over): the page can bring in its text
      if (introPhase === 'dolly' && s.focus?.kind !== 'view') finishIntro()
      controls.update()
      atmosphereUniforms.sunView.value.copy(sunScene).transformDirection(camera.matrixWorldInverse)

      // The Sun, always the same far distance from the camera in its real direction
      sunDisk.position.copy(camera.position).addScaledVector(sunScene, SUN_SPRITE_DISTANCE)
      sunDisk.scale.setScalar(SUN_SPRITE_SIZE)
      // Sunlight's shadow map covers just the moon being looked at, so its craters shadow at ~15 m detail
      const shadowMoon = moonOf(moonMode ?? approach?.id ?? (camera.position.distanceTo(moons[0].world) < camera.position.distanceTo(moons[1].world) ? moons[0].id : moons[1].id))
      const reach = (MOON_RADII[shadowMoon.id][0] * 1.3) / MARS_RADIUS_KM
      sun.target.position.copy(shadowMoon.world)
      sun.position.copy(shadowMoon.world).addScaledVector(sunScene, reach * 4)
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: reach, far: reach * 8 })
      sun.shadow.camera.updateProjectionMatrix()
      sun.shadow.normalBias = reach * 0.004
      sun.shadow.bias = -0.0005

      const { h } = view
      for (const [id, v] of siteVectors) {
        const el = markerRefs.current.get(id)
        if (!el) continue
        world.copy(v).applyMatrix4(planet.matrixWorld)
        // Sites are on the surface: visible on the hemisphere facing the camera
        const facing = world.dot(camera.position.clone().sub(world)) > 0
        pin(el, world, l.labels && facing)
      }
      for (const m of moons) m.orbitLine.visible = l.orbits
      for (const m of moons) {
        const label = moonMarkerRefs.current.get(m.id)
        if (label) {
          pin(label, m.world, l.labels)
          // Lift the label clear of the moon, however large it appears on screen
          const radius = MOON_RADII[m.id][0] * m.mesh.scale.x
          const px = (radius / (camera.position.distanceTo(m.world) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (h / 2)
          label.style.marginTop = `${-Math.min(px, h / 3) - 28}px`
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
    // Swap in NASA's model first (usually already loaded by the home page), so the shaders compile once.
    // If it fails or takes too long, keep the generated planet rather than keep the page waiting.
    const tooSlow = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Mars model timed out')), MODEL_WAIT_MS))
    Promise.race([loadMarsModel(), tooSlow])
      .then((model) => {
        if (disposed) return
        model.map.anisotropy = renderer.capabilities.getMaxAnisotropy()
        const nasa = new THREE.MeshStandardMaterial({ map: model.map, normalMap: model.normalMap, roughness: 0.9, metalness: 0 })
        // Fine grain finer than the model's texture, so the surface stays crisp when zoomed in
        addSurfaceDetail(nasa, { scale: 24, color: 0.25, relief: 0.004 })
        globe.geometry.dispose()
        globe.geometry = model.geometry
        globe.material = nasa
        material.dispose()
        colorMap.dispose()
        bumpMap.dispose()
      })
      .catch(() => { /* keep the generated planet */ })
      .then(() => renderer.compileAsync(scene, camera))
      .catch(() => { /* draw anyway; the first frame compiles what is left */ })
      .then(() => {
        if (disposed) return
        const { map, normalMap, bumpMap: bump } = globe.material
        for (const texture of [map, normalMap, bump]) if (texture) renderer.initTexture(texture)
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
    Object.assign(stateRef.current, { selectedId, selectedMoon, paused })
  }, [selectedId, selectedMoon, paused])

  // Reset view: glide back to the opening view over the sunlit side
  useEffect(() => {
    const s = stateRef.current
    if (resetKey && s.homeDir) s.focus = { kind: 'view', dir: s.homeDir.clone(), distance: CAMERA_DISTANCE }
  }, [resetKey])

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
