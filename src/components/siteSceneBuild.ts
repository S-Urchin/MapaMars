import * as THREE from 'three'
import type { SiteScene } from '../data/siteScenes'
import { addSurfaceDetail } from './surfaceDetail'

// Builds a landing site's ground, rocks and lander for the close-up (SiteTerrain).

// Ground patch size in meters, and its grid resolution (~0.23 m per cell, enough to show a trench).
const SIZE = 110
const SEGMENTS = 480
const ROCK_COUNT = 2800

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function noise2(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = x - xi, fy = y - yi
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm2(x: number, y: number, s: number, octaves: number) {
  let sum = 0, amp = 0.5, freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, s + i)
    freq *= 2.07
    amp *= 0.5
  }
  return sum
}

function segmentDistance(x: number, z: number, [ax, az]: [number, number], [bx, bz]: [number, number]) {
  const dx = bx - ax, dz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}

// A gently rolling plain with wind-blown drifts, a scatter of impact craters and the sampler trenches.
function createGround(site: SiteScene) {
  const rand = seeded(site.seed)
  const s = site.seed
  const craters: { x: number; z: number; r: number }[] = []
  while (craters.length < 14) {
    const r = 1.5 + Math.pow(rand(), 2.5) * 12
    const x = (rand() - 0.5) * SIZE * 0.9
    const z = (rand() - 0.5) * SIZE * 0.9
    if (Math.hypot(x, z) > r + 8) craters.push({ x, z, r })
  }

  const sample = (x: number, z: number) => {
    let h = (fbm2(x * 0.018, z * 0.018, s, 4) - 0.5) * 4
    h += (fbm2(x * 0.09, z * 0.09, s + 10, 3) - 0.5) * 0.7
    // Drifts: elongated ridges that only appear in some patches
    const patch = THREE.MathUtils.smoothstep(fbm2(x * 0.045, z * 0.045, s + 20, 2), 0.48, 0.62)
    const ridge = 1 - Math.abs(2 * noise2(x * 0.32 + z * 0.12, z * 0.06 - x * 0.03, s + 30) - 1)
    const drift = patch * ridge * ridge
    h += drift * 0.35
    let bowl = 0
    for (const c of craters) {
      const q = Math.hypot(x - c.x, z - c.z) / c.r
      if (q > 1.8) continue
      if (q < 1) {
        h -= c.r * 0.12 * (1 - q * q)
        bowl = Math.max(bowl, 1 - q)
      }
      h += c.r * 0.045 * Math.exp(-(((q - 1) / 0.22) ** 2))
    }
    // Trenches: a dark groove with the dug-out soil heaped along both sides
    let dug = 0
    let spoil = 0
    for (const t of site.trenches) {
      const d = segmentDistance(x, z, t.from, t.to) / 0.34
      dug = Math.max(dug, 1 - d)
      spoil = Math.max(spoil, Math.exp(-(((d - 1.5) / 0.45) ** 2)))
    }
    if (dug > 0) h -= 0.2 * Math.sqrt(dug)
    h += spoil * 0.06
    // Ease down to the level plain over a wide band, reaching it exactly at the patch edge
    const edge = THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), SIZE / 2 - 25, SIZE / 2 - 1)
    return { h: h * (1 - edge), drift: drift * (1 - edge), bowl: bowl * (1 - edge), dug: Math.max(0, dug) + spoil * 0.25, edge }
  }

  return { craters, sample, height: (x: number, z: number) => sample(x, z).h }
}

const TERRAIN_DETAIL = { scale: 1.4, color: 0.45, relief: 0.06 }
const GROUND_BASE = '#a45d3a'
const GROUND_DARK = '#5c3321'

// Light and dark ground patches: small ones only on the detailed patch, broad ones (the albedo
// variation seen from high up) shared with the plain around it so the two match at the edge.
const mottleLocal = (x: number, z: number, seed: number) => (fbm2(x * 0.05, z * 0.05, seed + 40, 3) - 0.5) * 0.5
const mottleBroad = (x: number, z: number, seed: number) => (fbm2(x * 0.004, z * 0.004, seed + 50, 3) - 0.5) * 0.7

// Plain cell size; with an odd cell count, grid lines fall exactly on the detailed patch's edges.
const PLAIN_CELL = 10
const PLAIN_CELLS = 241

// A wide, level plain around the detailed patch, so the ground runs to the horizon when seen from high
// up. It is level with the patch's edge, and its vertices inside the patch drop out of sight beneath it.
function buildPlain(site: SiteScene) {
  const extent = PLAIN_CELL * PLAIN_CELLS
  const geometry = new THREE.PlaneGeometry(extent, extent, PLAIN_CELLS, PLAIN_CELLS).rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const base = new THREE.Color(GROUND_BASE), dark = new THREE.Color(GROUND_DARK), c = new THREE.Color()
  const inside = SIZE / 2 - 0.01
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    if (Math.abs(x) < inside && Math.abs(z) < inside) pos.setY(i, -8)
    c.copy(base).lerp(dark, mottleBroad(x, z, site.seed))
    c.toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // Keep the plane's straight-up normals: recomputing them would tilt the edge row toward the hidden drop
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 })
  addSurfaceDetail(material, TERRAIN_DETAIL)
  return new THREE.Mesh(geometry, material)
}

function buildTerrain(ground: ReturnType<typeof createGround>, site: SiteScene) {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const base = new THREE.Color(GROUND_BASE), sand = new THREE.Color('#c98d5e'), dark = new THREE.Color(GROUND_DARK), soil = new THREE.Color('#3f2418')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const g = ground.sample(x, z)
    pos.setY(i, g.h)
    c.copy(base)
    c.lerp(sand, Math.min(1, g.drift * 1.1))
    c.lerp(dark, g.bowl * 0.35 + mottleLocal(x, z, site.seed) * (1 - g.edge) + mottleBroad(x, z, site.seed))
    c.lerp(soil, Math.min(1, g.dug))
    c.toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 })
  addSurfaceDetail(material, TERRAIN_DETAIL)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.castShadow = true
  return mesh
}

function rockGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 2)
  const p = geometry.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 0.82 + 0.22 * Math.sin(x * 5.1 + y * 3.7) * Math.cos(z * 4.3 - y * 2.1)
    p.setXYZ(i, x * k, y * k, z * k)
  }
  geometry.computeVertexNormals()
  return geometry
}

function rockMaterial(color: THREE.ColorRepresentation) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 })
  addSurfaceDetail(material, { scale: 3, color: 0.4, relief: 0.03 })
  return material
}

// Rocks everywhere, thicker around crater rims where ejecta landed. Kept clear of the lander and trenches.
function buildRocks(ground: ReturnType<typeof createGround>, site: SiteScene) {
  const rand = seeded(site.seed + 7)
  const geometry = rockGeometry()
  const rocks = new THREE.InstancedMesh(geometry, rockMaterial('#ffffff'), ROCK_COUNT)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3()
  const shades = [new THREE.Color('#5a3a2c'), new THREE.Color('#7d5a47'), new THREE.Color('#3b2c26'), new THREE.Color('#8a6852')]
  const c = new THREE.Color()
  let n = 0
  while (n < ROCK_COUNT) {
    let x: number, z: number
    if (rand() < 0.3) {
      const cr = ground.craters[Math.floor(rand() * ground.craters.length)]
      const a = rand() * Math.PI * 2
      const d = cr.r * (1 + rand() * 0.8)
      x = cr.x + Math.cos(a) * d
      z = cr.z + Math.sin(a) * d
    } else {
      x = (rand() - 0.5) * SIZE * 0.95
      z = (rand() - 0.5) * SIZE * 0.95
    }
    if (Math.hypot(x, z) < 2 || Math.max(Math.abs(x), Math.abs(z)) > SIZE / 2 - 14) continue
    if (site.trenches.some((t) => segmentDistance(x, z, t.from, t.to) < 0.6)) continue
    const size = 0.04 + Math.pow(rand(), 6) * 0.85
    sc.set(size * (0.8 + rand() * 0.5), size * (0.45 + rand() * 0.45), size * (0.8 + rand() * 0.5))
    v.set(x, ground.height(x, z) - sc.y * 0.3, z)
    q.setFromEuler(e.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6))
    rocks.setMatrixAt(n, m.compose(v, q, sc))
    rocks.setColorAt(n, c.copy(shades[Math.floor(rand() * shades.length)]))
    n++
  }
  rocks.castShadow = true
  rocks.receiveShadow = true

  const group = new THREE.Group()
  group.add(rocks)
  const boulderMat = rockMaterial('#6b4838')
  for (const b of site.boulders) {
    const boulder = new THREE.Mesh(geometry, boulderMat)
    boulder.scale.set(...b.size)
    boulder.position.set(b.x, ground.height(b.x, b.z) + b.size[1] * 0.45, b.z)
    boulder.rotation.set(0.15, rand() * Math.PI * 2, -0.1)
    boulder.castShadow = true
    boulder.receiveShadow = true
    group.add(boulder)
  }
  return group
}

// A simplified Viking lander: six-sided body on three legs, dish antenna, cameras, weather boom and sampler arm.
function buildLander(ground: ReturnType<typeof createGround>, site: SiteScene) {
  const group = new THREE.Group()
  const y0 = ground.height(0, 0)
  const metal = new THREE.MeshStandardMaterial({ color: '#d9d5cd', metalness: 0.35, roughness: 0.5 })
  const dark = new THREE.MeshStandardMaterial({ color: '#34322f', metalness: 0.2, roughness: 0.7 })
  const foil = new THREE.MeshStandardMaterial({ color: '#b8914c', metalness: 0.7, roughness: 0.35 })
  const up = new THREE.Vector3(0, 1, 0)
  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  const strut = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
    const mesh = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), mat))
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize())
    return mesh
  }
  const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y0 + y, z)

  add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.42, 6), metal)).position.set(0, y0 + 1.25, 0)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.45), foil)).position.set(-0.1, y0 + 1.57, -0.15)

  for (const deg of [90, 210, 330]) {
    const a = THREE.MathUtils.degToRad(deg)
    const fx = Math.cos(a) * 1.55, fz = Math.sin(a) * 1.55
    const foot = new THREE.Vector3(fx, ground.height(fx, fz) + 0.08, fz)
    strut(at(Math.cos(a) * 0.72, 1.12, Math.sin(a) * 0.72), foot, 0.05, metal)
    for (const side of [-0.45, 0.45]) strut(at(Math.cos(a + side) * 0.62, 1.08, Math.sin(a + side) * 0.62), foot, 0.025, metal)
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.06, 14), metal)).position.set(fx, foot.y - 0.05, fz)
  }

  for (const deg of [150, 270]) {
    const a = THREE.MathUtils.degToRad(deg)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), dark)).position.set(Math.cos(a) * 0.9, y0 + 1.55, Math.sin(a) * 0.9)
  }

  strut(at(-0.35, 1.45, -0.35), at(-0.35, 2.2, -0.35), 0.035, metal)
  const dish = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.06, 0.16, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#e8e4dc', metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide })))
  dish.position.set(-0.35, y0 + 2.28, -0.35)
  dish.rotation.set(0.9, 0.6, 0)

  for (const [x, z] of [[0.7, 0.6], [0.95, 0]] as const) {
    strut(at(x, 1.45, z), at(x, 1.8, z), 0.08, metal)
    add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), dark)).position.set(x, y0 + 1.86, z)
  }

  strut(at(-0.75, 1.3, 0.55), at(-1.1, 1.65, 0.9), 0.02, metal)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.08), dark)).position.set(-1.1, y0 + 1.68, 0.9)

  const trench = site.trenches[0]
  if (trench) {
    const [tx, tz] = trench.from
    const tip = new THREE.Vector3(tx, ground.height(tx, tz) + 0.22, tz)
    strut(at(0.95, 1.15, 0.5), tip, 0.04, metal)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.12), dark)).position.copy(tip)
  }
  return group
}

type PreparedSite = { ground: ReturnType<typeof createGround>; objects: THREE.Object3D[] }
const prepared = new WeakMap<SiteScene, PreparedSite>()

/**
 * Generate a site's ground, rocks and lander (about half a second of work) and keep them. Call this at a
 * moment when a brief pause won't show; the close-up then opens without it. A close-up that disposes these
 * on unmount only frees their GPU copies, which are simply uploaded again next time.
 */
export function prepareSiteScene(site: SiteScene) {
  let p = prepared.get(site)
  if (!p) {
    const ground = createGround(site)
    p = { ground, objects: [buildPlain(site), buildTerrain(ground, site), buildRocks(ground, site), buildLander(ground, site)] }
    prepared.set(site, p)
  }
  return p
}
