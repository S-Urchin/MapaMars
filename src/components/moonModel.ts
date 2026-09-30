import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { MoonId } from '../data/marsSky'
import { MOON_RADII } from '../data/marsSky'

/** How much the moons are enlarged when not shown at true size. */
export const MOON_BOOST = 20

type Crater ={ dir: THREE.Vector3; radius: number; depth: number }

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
function fbm(p: THREE.Vector3, seed: number) {
  let sum = 0, amp = 0.5, freq = 1.6
  for (let o = 0; o < 4; o++) {
    sum += amp * (valueNoise(p.x * freq, p.y * freq, p.z * freq, seed + o) - 0.5)
    amp *= 0.5
    freq *= 2.1
  }
  return sum
}

// Bowl with a slightly raised rim; `a` is the angle from the crater centre over its angular radius
function craterProfile(a: number) {
  if (a > 1.35) return 0
  if (a < 1) return a * a - 1
  return 0.25 * Math.sin(((a - 1) / 0.35) * Math.PI)
}

const SETTINGS: Record<MoonId, { seed: number; craters: number; lumpiness: number; color: string }> = {
  phobos: { seed: 11, craters: 70, lumpiness: 0.16, color: '#6f655c' },
  // Deimos is smoother: dust fills most of its craters
  deimos: { seed: 29, craters: 30, lumpiness: 0.1, color: '#857a6e' },
}

/**
 * Irregular, cratered moon shape in km. Axes: z = long axis (points at Mars once tidally locked),
 * x = middle axis (along the orbit), y = short axis (toward the orbit pole).
 */
function buildMoonGeometry(id: MoonId) {
  const { seed, craters: count, lumpiness } = SETTINGS[id]
  const rand = mulberry32(seed)
  const craters: Crater[] = []
  if (id === 'phobos') {
    // Stickney, ~9 km across, on the leading side about 50° from the point facing Mars
    craters.push({ dir: new THREE.Vector3(-Math.sin(0.86), -0.02, Math.cos(0.86)).normalize(), radius: 0.42, depth: 0.12 })
  }
  for (let i = 0; i < count; i++) {
    const r = 0.05 + Math.pow(rand(), 3) * 0.25
    // Seeded uniform direction, so the moon looks the same on every load
    const z = rand() * 2 - 1
    const phi = rand() * Math.PI * 2
    const dir = new THREE.Vector3(Math.sqrt(1 - z * z) * Math.cos(phi), Math.sqrt(1 - z * z) * Math.sin(phi), z)
    craters.push({ dir, radius: r, depth: r * (id === 'deimos' ? 0.12 : 0.22) })
  }

  // Only positions matter for welding the icosphere's shared corners; dropping the rest makes it much faster
  const sphere = new THREE.IcosahedronGeometry(1, 32)
  sphere.deleteAttribute('normal')
  sphere.deleteAttribute('uv')
  const geometry = mergeVertices(sphere, 1e-4)
  sphere.dispose()
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const [long, middle, short] = MOON_RADII[id]
  // A crater only reaches points within 1.35 of its radius; a dot product rules the rest out cheaply
  const reach = craters.map((c) => Math.cos(Math.min(Math.PI, c.radius * 1.35)))
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    let r = 1 + fbm(v, seed) * lumpiness
    craters.forEach((c, k) => {
      const cos = v.dot(c.dir)
      if (cos > reach[k]) r += craterProfile(Math.acos(Math.min(1, cos)) / c.radius) * c.depth
    })
    pos.setXYZ(i, v.x * r * middle, v.y * r * short, v.z * r * long)
  }
  geometry.computeVertexNormals()
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

export function buildMoonMaterial(id: MoonId) {
  return new THREE.MeshStandardMaterial({ color: SETTINGS[id].color, roughness: 1, metalness: 0 })
}
