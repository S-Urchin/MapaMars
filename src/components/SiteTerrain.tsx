import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SiteScene } from '../data/siteScenes'
import { prepareSiteScene } from './siteSceneBuild'

// Resting camera for the bird's-eye view, relative to the lander.
const HOME = new THREE.Vector3(19, 16, 24)
// The descent: spiral down from high above into the bird's-eye view.
const INTRO_MS = 4200
const INTRO_HEIGHT = 300
// Flying to a point of interest and back out to the overview
const FLY_MS = 1500
// A change of lighting (Live, Day, Night) glides the Sun to its new place over this long
const SUN_MS = 1200
// Horizontal space a callout card needs before it is flipped to the other side of its dot.
const CARD_ROOM = 230
// Flashlight after dark: how brightly it lights the ground where it points (kept the same at any range),
// its beam half-angle in radians, and how quickly the beam catches up with the cursor (share per frame)
const TORCH_BRIGHTNESS = 1.8
const TORCH_ANGLE = 0.24
const TORCH_FOLLOW = 0.3
// Arriving at night, the flashlight waits for the descent to finish, then fades on over this long
const TORCH_ON_MS = 700
// Extra sky light during a night-time arrival, so the descent isn't played out in the dark
const NIGHT_ARRIVAL_FILL = 0.5

/**
 * Light from the sky (not the Sun's disk) for a Sun elevation in degrees, as a share of full daylight.
 * Mars's dusty air keeps scattering sunlight long after sunset: Mars Pathfinder saw twilight last about two
 * hours (Smith & Lemmon 1999). Roughly, the sky still gives a quarter of its daytime light as the Sun sets,
 * then dims about tenfold for every 4° the Sun sinks, so it is effectively black by ~10° below the horizon.
 * After that there is only starlight and Phobos, far too faint to see by: the night is pitch black.
 */
function skyLightShare(elevationDeg: number) {
  const AT_SUNSET = 0.25
  if (elevationDeg >= 0) return AT_SUNSET + (1 - AT_SUNSET) * THREE.MathUtils.smoothstep(elevationDeg, 0, 10)
  const share = AT_SUNSET * Math.pow(10, elevationDeg / 4)
  // Below a thousandth of daylight the eye (and the screen) sees nothing
  return share < 0.001 ? 0 : share
}

type Props = {
  site: SiteScene
  selectedPoi: string | null
  labels: boolean
  rotate: boolean
  onSelectPoi: (id: string) => void
  /** Where the Sun is right now at the site (unit vector: east, north, up), so shadows fall as they really would. */
  sun?: SunDirection | null
  /**
   * False to set the scene up out of sight (its shaders compile in the background) without drawing it or
   * starting the descent. Once true it warms up, calls onReady, then begins the descent.
   */
  active?: boolean
  /** Called once the scene can be shown without a hitch. */
  onReady?: () => void
}

export type SunDirection = { east: number; north: number; up: number }

// Without a real position, a low morning sun from the east throws long shadows across the rocks
const MORNING_SUN: SunDirection = { east: 0.89, north: -0.24, up: 0.39 }

/** The Sun as a small bright disk in a warm glow, for the sky above the site. */
function buildSkySun() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.06, 'rgba(255, 246, 225, 1)')
  g.addColorStop(0.1, 'rgba(255, 225, 190, 0.45)')
  g.addColorStop(0.35, 'rgba(255, 200, 150, 0.1)')
  g.addColorStop(1, 'rgba(255, 190, 140, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  sprite.scale.setScalar(90)
  return sprite
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function SiteTerrain({ site, selectedPoi, labels, rotate, onSelectPoi, sun = null, active = true, onReady }: Props) {
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  })
  const hostRef = useRef<HTMLDivElement>(null)
  const poiRefs = useRef(new Map<string, HTMLDivElement>())
  const stateRef = useRef({
    rotate,
    active,
    sun,
    applySun: null as ((sun: SunDirection) => void) | null,
    poiVectors: new Map<string, THREE.Vector3>(),
    flyTo: null as ((id: string) => void) | null,
    flyHome: null as (() => void) | null,
  })

  useEffect(() => {
    const host = hostRef.current!
    const state = stateRef.current
    const scene = new THREE.Scene()
    const fog = new THREE.Fog('#000000', 42, 92)
    scene.fog = fog
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    host.prepend(renderer.domElement)

    const { ground, objects } = prepareSiteScene(site)
    scene.add(...objects)

    // Sunlight from where the Sun really is over the site right now (see applySun)
    const skyLight = new THREE.HemisphereLight('#e9b48e', '#2a160e', 0.9)
    scene.add(skyLight)
    const sun = new THREE.DirectionalLight('#ffe0c0', 3.2)
    const skySun = buildSkySun()
    scene.add(skySun)
    const lowSun = new THREE.Color('#ffae78')
    const highSun = new THREE.Color('#ffe0c0')
    // 0 in daylight, 1 once the Sun is well below the horizon: how strongly the flashlight shines
    let darkness = 0
    // The sky's own light for the Sun's height, before any arrival fill (see the flashlight in tick)
    let skyGlow = 0.9
    const applySun = ({ east, north, up }: SunDirection) => {
      darkness = 1 - THREE.MathUtils.smoothstep(up, -0.04, 0.1)
      // Scene axes: x east, y up, z south
      sun.position.set(east, Math.max(up, 0.03), -north).normalize().multiplyScalar(60)
      sun.intensity = 3.2 * THREE.MathUtils.smoothstep(up, 0, 0.12)
      sun.color.copy(lowSun).lerp(highSun, THREE.MathUtils.smoothstep(up, 0.03, 0.4))
      // After sunset the dusty sky glows on through a long twilight, then goes black
      skyGlow = 0.9 * skyLightShare(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(up / Math.hypot(east, north, up), -1, 1))))
      skyLight.intensity = skyGlow
      skySun.position.set(east, up, -north).multiplyScalar(420)
      skySun.visible = up > -0.02
    }
    // A new sun position glides in (switching day and night plays like a quick sunrise or sunset)
    const sunNow = new THREE.Vector3()
    const sunFrom = new THREE.Vector3()
    const sunTo = new THREE.Vector3()
    let sunStart = -Infinity
    const showSun = (v: THREE.Vector3) => applySun({ east: v.x, north: v.y, up: v.z })
    state.applySun = ({ east, north, up }) => {
      sunFrom.copy(sunNow)
      sunTo.set(east, north, up)
      sunStart = performance.now()
    }
    const first = state.sun ?? MORNING_SUN
    sunNow.set(first.east, first.north, first.up)
    showSun(sunNow)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 120 })
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.03
    scene.add(sun, sun.target)

    // A flashlight for the night: held just below and to the right of the viewer, it lights wherever the
    // cursor points, and rocks and the lander throw shadows away from it. It stays in the scene by day at
    // zero brightness, so switching to night doesn't make the shaders rebuild (a visible stall).
    const torch = new THREE.SpotLight('#fff1dc', 0, 0, TORCH_ANGLE, 0.55, 2)
    torch.castShadow = true
    torch.shadow.mapSize.set(1024, 1024)
    torch.shadow.bias = -0.0005
    torch.shadow.normalBias = 0.03
    // Its shadow map is only redrawn while it is on, but it must be drawn once up front: shaders sample it
    // even at zero brightness, and some graphics drivers refuse to draw anything while it doesn't exist
    torch.shadow.autoUpdate = false
    torch.shadow.needsUpdate = true
    scene.add(torch, torch.target)
    // Where the cursor is over the scene (normalised device coordinates), or null when it is elsewhere
    let pointer: THREE.Vector2 | null = null
    const onPointerMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const onPointerLeave = () => { pointer = null }
    // Listen on the host, so the beam keeps following over the point-of-interest cards too
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerleave', onPointerLeave)

    // Where a ray from the camera through the cursor meets the ground: step along it (in bigger steps the
    // higher above the ground it is), then narrow down on the crossing. Aims at the sky pass off into the distance.
    const ray = new THREE.Ray()
    const aboveGround = (p: THREE.Vector3) => p.y - ground.height(p.x, p.z)
    const groundUnder = (ndc: THREE.Vector2, out: THREE.Vector3) => {
      ray.origin.copy(camera.position)
      ray.direction.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize()
      let before = 0
      let t = 0
      for (let i = 0; i < 160 && t < 250; i++) {
        const above = aboveGround(ray.at(t, out))
        if (above <= 0) {
          let lo = before, hi = t
          for (let k = 0; k < 10; k++) {
            const mid = (lo + hi) / 2
            if (aboveGround(ray.at(mid, out)) > 0) lo = mid
            else hi = mid
          }
          return ray.at(hi, out)
        }
        before = t
        t += THREE.MathUtils.clamp(above * 0.5, 0.15, 6)
      }
      return ray.at(80, out)
    }
    const beamGoal = new THREE.Vector3()
    const beamAim = new THREE.Vector3()
    const camRight = new THREE.Vector3()
    const camUp = new THREE.Vector3()
    let beamOn = false
    // When the arrival (dive, fade-in and descent) finished, so the flashlight can come on after it
    let arrivedAt = Infinity

    const y0 = ground.height(0, 0)
    const poiVectors = new Map(site.pois.map((p) => [p.id, new THREE.Vector3(p.x, ground.height(p.x, p.z) + p.lift, p.z)]))
    state.poiVectors = poiVectors

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, y0 + 0.8, 0)
    controls.enableDamping = true
    controls.screenSpacePanning = false
    controls.minDistance = 3
    controls.maxDistance = 60
    controls.maxPolarAngle = 1.38
    controls.rotateSpeed = 0.5
    controls.autoRotateSpeed = 0.4

    // Spiral down from high overhead: fast at first, then easing into the oblique view.
    const home = controls.target.clone().add(HOME)
    const homeAngle = Math.atan2(HOME.z, HOME.x)
    const homeRadius = Math.hypot(HOME.x, HOME.z)
    const introAt = (e: number) => {
      const a = homeAngle - 1.4 * (1 - e)
      const r = THREE.MathUtils.lerp(3, homeRadius, e * e)
      return controls.target.clone().add(new THREE.Vector3(Math.cos(a) * r, THREE.MathUtils.lerp(INTRO_HEIGHT, HOME.y, e), Math.sin(a) * r))
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // The descent starts when the close-up is first shown (see active), not when it is built
    let introStart = reduced ? -Infinity : Infinity
    camera.position.copy(reduced ? home : introAt(0))

    // Camera moves between the overview and a point of interest: timed and eased at both ends
    const homeTarget = controls.target.clone()
    let fly: { fromTarget: THREE.Vector3; fromPosition: THREE.Vector3; target: THREE.Vector3; position: THREE.Vector3; start: number } | null = null
    const flyBetween = (target: THREE.Vector3, position: THREE.Vector3) => {
      introStart = -Infinity
      fly = { fromTarget: controls.target.clone(), fromPosition: camera.position.clone(), target, position, start: performance.now() }
    }
    state.flyTo = (id) => {
      const p = poiVectors.get(id)
      if (!p) return
      const bearing = camera.position.clone().sub(controls.target).setY(0).normalize()
      flyBetween(p.clone(), p.clone().addScaledVector(bearing, 9).setY(p.y + 7))
    }
    // Back out to the overview the descent ended on
    state.flyHome = () => flyBetween(homeTarget.clone(), home.clone())
    controls.addEventListener('start', () => {
      introStart = -Infinity
      fly = null
    })

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const projected = new THREE.Vector3()
    let frame = 0
    // Set up every shader in the background first: drawing straight away makes the browser wait for the
    // graphics driver, which froze the globe's dive for over a second as this scene appeared
    let compiled = false
    let disposed = false
    let warmFrames = 0
    renderer.compileAsync(scene, camera).catch(() => { /* draw anyway */ }).then(() => {
      if (!disposed) compiled = true
    })

    // Read the same clock the intro started on, so the descent can't jump ahead
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const now = performance.now()
      // Nothing to do until the page asks for the scene (its shaders keep compiling meanwhile)
      if (!compiled || !state.active) return
      if (warmFrames < 3) {
        // The first draws still finish GPU setup; do them while still hidden, then say we're ready
        renderer.render(scene, camera)
        if (++warmFrames === 3) onReadyRef.current?.()
        return
      }
      if (introStart === Infinity) introStart = now
      if (now - sunStart < SUN_MS) {
        const s = (now - sunStart) / SUN_MS
        sunNow.lerpVectors(sunFrom, sunTo, s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2)
        showSun(sunNow)
      } else if (!sunNow.equals(sunTo) && sunStart > -Infinity) {
        sunNow.copy(sunTo)
        showSun(sunNow)
      }

      const t = (now - introStart) / INTRO_MS
      if (t < 1) {
        camera.position.copy(introAt(easeOutCubic(Math.max(0, t))))
        camera.lookAt(controls.target)
      } else {
        if (fly) {
          const f = reduced ? 1 : Math.min(1, (now - fly.start) / FLY_MS)
          const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2
          controls.target.lerpVectors(fly.fromTarget, fly.target, e)
          camera.position.lerpVectors(fly.fromPosition, fly.position, e)
          if (f >= 1) fly = null
        }
        controls.autoRotate = state.rotate && !fly
        controls.update()
        // Keep panning within the modelled ground
        const r = Math.hypot(controls.target.x, controls.target.z)
        if (r > 35) {
          const k = 35 / r
          camera.position.x -= controls.target.x * (1 - k)
          camera.position.z -= controls.target.z * (1 - k)
          controls.target.x *= k
          controls.target.z *= k
        }
      }

      // Keep the ground clear of fog however high the camera is
      const distance = camera.position.distanceTo(controls.target)
      fog.near = Math.max(42, distance - 15)
      fog.far = Math.max(92, distance + 60)

      // Flashlight: on after dark, aimed at the ground under the cursor (or the view's centre without one).
      // It only comes on once the descent from the globe is over (or the user takes the camera), fading up
      // rather than popping on, so the arrival plays out first.
      if (t >= 1 && arrivedAt === Infinity) arrivedAt = now
      const switchOn = arrivedAt === Infinity ? 0 : reduced ? 1 : THREE.MathUtils.smoothstep((now - arrivedAt) / TORCH_ON_MS, 0, 1)
      const torchOn = darkness > 0.001 && switchOn > 0
      // Arriving at night, a soft fill keeps the site visible through the descent, then hands over to the
      // flashlight: it fades out as the beam fades on
      skyLight.intensity = skyGlow + NIGHT_ARRIVAL_FILL * darkness * (1 - switchOn)
      if (torchOn) {
        camera.updateMatrixWorld()
        if (pointer) groundUnder(pointer, beamGoal)
        else beamGoal.copy(controls.target)
        // A steady hand: the beam swings after the cursor rather than snapping to it
        if (beamOn) beamAim.lerp(beamGoal, TORCH_FOLLOW)
        else beamAim.copy(beamGoal)
        const reach = camera.position.distanceTo(beamAim)
        camRight.setFromMatrixColumn(camera.matrixWorld, 0)
        camUp.setFromMatrixColumn(camera.matrixWorld, 1)
        torch.position.copy(camera.position).addScaledVector(camRight, reach * 0.06).addScaledVector(camUp, -reach * 0.05)
        torch.target.position.copy(beamAim)
        // Brightness grows with range so the lit patch looks the same near or far (light fades with distance²)
        torch.intensity = TORCH_BRIGHTNESS * darkness * switchOn * torch.position.distanceToSquared(beamAim)
      } else torch.intensity = 0
      torch.shadow.autoUpdate = torchOn
      beamOn = torchOn

      const { clientWidth: w, clientHeight: h } = host
      for (const p of site.pois) {
        const el = poiRefs.current.get(p.id)
        if (!el) continue
        projected.copy(poiVectors.get(p.id)!).project(camera)
        const sx = ((projected.x + 1) / 2) * w
        const sy = ((1 - projected.y) / 2) * h
        const visible = projected.z < 1 && t >= 0.85
        el.style.transform = `translate(${sx}px, ${sy}px)`
        el.style.opacity = visible ? '1' : '0'
        el.style.visibility = visible ? 'visible' : 'hidden'

        // Swing the card to the other side of its dot when it would run off the frame
        let [dx, dy] = p.card
        if (dx >= 0 ? sx + dx + CARD_ROOM > w : sx + dx - CARD_ROOM < 0) dx = -dx
        if (sy + dy < 40 || sy + dy > h - 40) dy = -dy
        const offset = `${dx},${dy}`
        if (el.dataset.offset !== offset) {
          el.dataset.offset = offset
          const line = el.querySelector<HTMLElement>('.poi-line')!
          const card = el.querySelector<HTMLElement>('.poi-card')!
          line.style.width = `${Math.hypot(dx, dy)}px`
          line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
          card.style.transform = `translate(calc(${dx}px - ${dx < 0 ? 100 : 0}%), calc(${dy}px - 50%))`
        }
      }
      renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerleave', onPointerLeave)
      controls.dispose()
      state.flyTo = null
      state.flyHome = null
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
  }, [site])

  useEffect(() => {
    stateRef.current.rotate = rotate
  }, [rotate])

  useEffect(() => {
    stateRef.current.active = active
  }, [active])

  // The Sun creeps across the sky; follow it whenever the page passes a new position
  const { east, north, up } = sun ?? MORNING_SUN
  useEffect(() => {
    const s = stateRef.current
    s.sun = { east, north, up }
    s.applySun?.(s.sun)
  }, [east, north, up])

  // Opening a point of interest flies to it; closing it (clicking it again) zooms back out to the overview
  const hadPoi = useRef(false)
  useEffect(() => {
    if (selectedPoi) stateRef.current.flyTo?.(selectedPoi)
    else if (hadPoi.current) stateRef.current.flyHome?.()
    hadPoi.current = !!selectedPoi
  }, [selectedPoi])

  return (
    <div className={`globe-host terrain-host${labels ? '' : ' hide-labels'}${selectedPoi ? ' has-selection' : ''}`} ref={hostRef}>
      <div className="poi-layer">
        {site.pois.map((p) => {
          const selected = p.id === selectedPoi
          return (
            <div
              key={p.id}
              className={`poi${selected ? ' is-selected' : ''}`}
              ref={(el) => { if (el) poiRefs.current.set(p.id, el); else poiRefs.current.delete(p.id) }}
            >
              {/* The line and card are positioned each frame in the render loop */}
              <span className="poi-line" />
              <button type="button" className="poi-dot" aria-label={p.title} aria-pressed={selected} onClick={() => onSelectPoi(p.id)} />
              <button
                type="button"
                className="poi-card"
                onClick={() => onSelectPoi(p.id)}
                tabIndex={-1}
              >
                <strong>{p.title}</strong>
                {selected && <span>{p.text}</span>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
