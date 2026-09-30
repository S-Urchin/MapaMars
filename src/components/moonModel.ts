import * as THREE from 'three'
import type { MoonId } from '../data/marsSky'
import { MOON_RADII } from '../data/marsSky'
import { addSurfaceDetail } from './surfaceDetail'

type Crater = { dir: THREE.Vector3; radius: number; depth: number; reach: number; fresh: number }

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Smooth 3D value noise on integer lattice points
function hash3(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 144665)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function valueNoise(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const f = (t: number) => t * t * (3 - 2 * t)
  const u = f(x - xi), v = f(y - yi), w = f(z - zi)
  let total = 0
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const weight = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w)
    total += weight * hash3(xi + dx, yi + dy, zi + dz, seed)
  }
  return total
}
function fbm(x: number, y: number, z: number, seed: number, octaves: number, freq: number) {
  let sum = 0, amp = 0.5
  for (let o = 0; o < octaves; o++) {
    sum += amp * (valueNoise(x * freq, y * freq, z * freq, seed + o) - 0.5)
    amp *= 0.5
    freq *= 2.03
  }
  return sum
}

/**
 * Crater cross-section: a bowl, a raised rim and an ejecta apron fading outward.
 * `a` is the angle from the crater's centre divided by its angular radius.
 */
function craterProfile(a: number) {
  if (a < 1) return a * a - 1
  if (a < 1.3) return 0.28 * Math.sin(((a - 1) / 0.3) * Math.PI * 0.5 + Math.PI * 0.5)
  if (a < 2.2) return 0.28 * Math.pow(1 - (a - 1.3) / 0.9, 2)
  return 0
}

type Settings = {
  seed: number
  /** Cube-sphere grid cells per face edge */
  resolution: number
  craters: number
  /** Crater depth relative to its radius; Deimos's are half filled with dust */
  depthRatio: number
  lumpiness: number
  /** Surface colour in linear RGB, before shading */
  base: [number, number, number]
  grooves: boolean
}

const SETTINGS: Record<MoonId, Settings> = {
  phobos: { seed: 11, resolution: 170, craters: 380, depthRatio: 0.24, lumpiness: 0.13, base: [0.03, 0.026, 0.023], grooves: true },
  deimos: { seed: 29, resolution: 130, craters: 160, depthRatio: 0.1, lumpiness: 0.08, base: [0.04, 0.035, 0.03], grooves: false },
}

/** Stickney: ~9 km across, on the leading side about 50° from the point facing Mars (+z faces Mars, -x leads). */
const STICKNEY = new THREE.Vector3(-Math.sin(0.86), -0.02, Math.cos(0.86)).normalize()

/**
 * Phobos's grooves: families of long, parallel chains of pits, strongest on the leading hemisphere and
 * fading out on the trailing one. Each family is a set of evenly spaced planes cutting the moon.
 */
const GROOVE_FAMILIES = [
  { normal: new THREE.Vector3(0.12, 1, 0.1).normalize(), spacing: 0.055, offset: 0.013 },
  { normal: new THREE.Vector3(-0.28, 1, -0.18).normalize(), spacing: 0.07, offset: 0.031 },
  { normal: new THREE.Vector3(0.35, 1, 0.32).normalize(), spacing: 0.09, offset: 0.047 },
]

function makeCraters(id: MoonId, s: Settings) {
  const rand = mulberry32(s.seed)
  const craters: Crater[] = []
  const add = (dir: THREE.Vector3, radius: number, depth: number, fresh: number) =>
    craters.push({ dir, radius, depth, reach: Math.cos(Math.min(Math.PI, radius * 2.2)), fresh })
  if (id === 'phobos') add(STICKNEY.clone(), 0.42, 0.1, 0.9)
  else {
    // Deimos's two named craters, Voltaire and Swift, both small and softened by dust
    add(new THREE.Vector3(0.5, 0.35, 0.8).normalize(), 0.16, 0.02, 0.4)
    add(new THREE.Vector3(-0.3, 0.55, -0.78).normalize(), 0.12, 0.015, 0.4)
  }
  for (let i = 0; i < s.craters; i++) {
    // Many small craters, few large ones (a power-law size distribution, like real cratered surfaces)
    const radius = Math.min(0.26, 0.022 * Math.pow(1 - rand(), -1 / 1.25))
    const z = rand() * 2 - 1
    const phi = rand() * Math.PI * 2
    const dir = new THREE.Vector3(Math.sqrt(1 - z * z) * Math.cos(phi), Math.sqrt(1 - z * z) * Math.sin(phi), z)
    // Older craters are shallower and duller; fresh ones deep, with bright rims
    const fresh = Math.pow(rand(), 1.5)
    add(dir, radius, radius * s.depthRatio * (0.45 + 0.55 * fresh), fresh)
  }
  return craters
}

/** Cube-sphere with shared edge vertices: an even grid over the whole moon, cheap to build. */
function cubeSphere(n: number) {
  const positions: number[] = []
  const indices: number[] = []
  const shared = new Map<string, number>()
  const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
    [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
    [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],
    [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
  ]
  const p = new THREE.Vector3()
  for (const [normal, u, v] of faces) {
    const row: number[] = []
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        // tan() warps the grid so cells stay close to the same size after projecting onto the sphere
        const a = Math.tan(((i / n) * 2 - 1) * Math.PI / 4)
        const b = Math.tan(((j / n) * 2 - 1) * Math.PI / 4)
        p.copy(normal).addScaledVector(u, a).addScaledVector(v, b).normalize()
        const onEdge = i === 0 || j === 0 || i === n || j === n
        const key = onEdge ? `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}` : ''
        let index = onEdge ? shared.get(key) : undefined
        if (index === undefined) {
          index = positions.length / 3
          positions.push(p.x, p.y, p.z)
          if (onEdge) shared.set(key, index)
        }
        row.push(index)
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = row[j * (n + 1) + i], b = row[j * (n + 1) + i + 1]
        const c = row[(j + 1) * (n + 1) + i], d = row[(j + 1) * (n + 1) + i + 1]
        indices.push(a, b, d, a, d, c)
      }
    }
  }
  return { positions: new Float32Array(positions), indices }
}

/**
 * Irregular, heavily cratered moon at true size, in km. Axes: z = long axis (points at Mars once tidally
 * locked), x = middle axis (along the orbit), y = short axis (toward the orbit pole).
 */
function buildMoonGeometry(id: MoonId) {
  const s = SETTINGS[id]
  const craters = makeCraters(id, s)
  const { positions, indices } = cubeSphere(s.resolution)
  const colors = new Float32Array(positions.length)
  const [long, middle, short] = MOON_RADII[id]
  const v = new THREE.Vector3()
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2])
    // Overall lumpy shape, then finer knobbly relief
    let r = 1 + fbm(v.x, v.y, v.z, s.seed, 3, 1.4) * s.lumpiness + fbm(v.x, v.y, v.z, s.seed + 50, 4, 9) * 0.012
    let brightness = 1 + fbm(v.x, v.y, v.z, s.seed + 90, 3, 3) * 0.35
    for (const c of craters) {
      const cos = v.dot(c.dir)
      if (cos <= c.reach) continue
      const a = Math.acos(Math.min(1, cos)) / c.radius
      r += craterProfile(a) * c.depth
      // Fresh craters: darker floors, bright rims and ejecta
      if (a < 1) brightness *= 1 - 0.12 * c.fresh * (1 - a * a)
      else if (a < 2.2) brightness *= 1 + 0.18 * c.fresh * (1 - (a - 1) / 1.2)
    }
    if (s.grooves) {
      // Grooves: pitted troughs about 100–200 m wide, fading from the leading side (-x) to the trailing side
      const strength = THREE.MathUtils.smoothstep(-v.x, -0.35, 0.45)
      if (strength > 0) {
        GROOVE_FAMILIES.forEach((g, f) => {
          const t = (v.dot(g.normal) + g.offset) / g.spacing
          const k = Math.round(t)
          // Not every plane holds a groove, and each has its own width and depth
          const pick = hash3(k, f, 3, s.seed)
          if (pick < 0.35) return
          const width = 0.006 + 0.007 * hash3(k, f, 5, s.seed)
          const dist = Math.abs(t - k) * g.spacing
          // Broken into chains of pits along its length rather than one continuous trench
          const along = valueNoise(v.x * 34 + k * 7.1, v.y * 34, v.z * 34 - f * 3.3, s.seed + 7)
          const pits = THREE.MathUtils.smoothstep(along, 0.32, 0.6)
          r -= (0.004 + 0.004 * pick) * strength * pits * Math.exp(-((dist / width) ** 2))
        })
      }
    }
    // Phobos's "blue" unit around Stickney is slightly bluer and brighter than the redder rest
    const blue = id === 'phobos' ? THREE.MathUtils.smoothstep(v.dot(STICKNEY), 0.55, 0.9) : 0
    colors[i] = s.base[0] * brightness * (1 - 0.1 * blue)
    colors[i + 1] = s.base[1] * brightness * (1 + 0.02 * blue)
    colors[i + 2] = s.base[2] * brightness * (1 + 0.16 * blue)
    positions[i] = v.x * r * middle
    positions[i + 1] = v.y * r * short
    positions[i + 2] = v.z * r * long
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

const geometries = new Map<MoonId, THREE.BufferGeometry>()

/**
 * The moon's shape, built once and kept. The home page builds both ahead of time so the globe opens
 * without a pause; a globe that disposes it simply uploads it to the GPU again on next use.
 */
export function getMoonGeometry(id: MoonId) {
  let geometry = geometries.get(id)
  if (!geometry) {
    geometry = buildMoonGeometry(id)
    geometries.set(id, geometry)
  }
  return geometry
}

export function buildMoonMaterial() {
  // Colour comes from the vertices (linear RGB); the shader adds regolith grain finer than the mesh.
  // Object space is in km: the largest grain is ~400 m across and ~50 m high.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
  addSurfaceDetail(material, { scale: 2.5, color: 0.4, relief: 0.05 / 3389.5 })
  return material
}
