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
    const applySun = ({ east, north, up }: SunDirection) => {
      // Scene axes: x east, y up, z south
      sun.position.set(east, Math.max(up, 0.03), -north).normalize().multiplyScalar(60)
      sun.intensity = 3.2 * THREE.MathUtils.smoothstep(up, 0, 0.12)
      sun.color.copy(lowSun).lerp(highSun, THREE.MathUtils.smoothstep(up, 0.03, 0.4))
      // After sunset only a faint sky glow remains, then starlight
      skyLight.intensity = 0.22 + 0.68 * THREE.MathUtils.smoothstep(up, -0.1, 0.15)
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
