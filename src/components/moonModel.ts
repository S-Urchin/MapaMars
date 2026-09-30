import * as THREE from 'three'
import type { MoonId } from '../data/marsSky'
import { MOON_RADII } from '../data/marsSky'
import { addSurfaceDetail } from './surfaceDetail'

/**
 * Measured shapes of Phobos and Deimos: Ernst et al. (2023), "High-resolution shape models of Phobos and
 * Deimos from stereophotoclinometry", Earth Planets Space 75:103, built from Viking, Phobos 2, Mars Global
 * Surveyor, Mars Express and Mars Reconnaissance Orbiter images. Downloaded from the Small Body Mapping Tool
 * (https://sbmt.jhuapl.edu/shared-files/): Phobos at 148 m and Deimos at 83 m grid spacing, 196,608
 * triangles each. Packed by scratch tooling into a compact gzipped file:
 *   Uint32 vertex count, Uint32 triangle count, Float32 km per step,
 *   Int16 x, y, z per vertex (km / step, under 0.2 m of rounding), Int32 index deltas (index minus the one before).
 * Coordinates are the moon's IAU body-fixed frame in km: +X toward Mars, +Z the spin (orbit) pole.
 */
export const MOON_SHAPE_CREDIT = 'Moon shapes: Ernst et al. 2023 (JHU/APL SBMT)'
const shapeUrl = (id: MoonId) => `/resources/${id}-shape.bin`

/** Surface colour in linear RGB, before shading: both moons are very dark, Deimos a touch lighter. */
const BASE_COLOR: Record<MoonId, [number, number, number]> = {
  phobos: [0.03, 0.026, 0.023],
  deimos: [0.04, 0.035, 0.03],
}

/** Stickney crater's centre, 1°S 49°W, as a body-fixed direction. */
const STICKNEY = new THREE.Vector3(Math.cos(-49 * THREE.MathUtils.DEG2RAD), Math.sin(-49 * THREE.MathUtils.DEG2RAD), -0.017).normalize()

/**
 * The globe's moon axes: z toward Mars (the mesh is turned with lookAt), y toward the orbit pole and x along
 * the orbit, with -x leading. From body-fixed (X toward Mars, Z pole) that is x = Y, y = Z, z = X, a
 * cyclic swap, so triangles keep their winding.
 */
const toGlobeAxes = (x: number, y: number, z: number, out: THREE.Vector3) => out.set(y, z, x)

/** Colour each vertex: the base tone, with Phobos's bluer, brighter "blue unit" around Stickney. */
function vertexColors(id: MoonId, positions: ArrayLike<number>) {
  const [r, g, b] = BASE_COLOR[id]
  const colors = new Float32Array(positions.length)
  const stickney = toGlobeAxes(STICKNEY.x, STICKNEY.y, STICKNEY.z, new THREE.Vector3())
  const v = new THREE.Vector3()
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2]).normalize()
    const blue = id === 'phobos' ? THREE.MathUtils.smoothstep(v.dot(stickney), 0.55, 0.9) : 0
    colors[i] = r * (1 - 0.1 * blue)
    colors[i + 1] = g * (1 + 0.02 * blue)
    colors[i + 2] = b * (1 + 0.16 * blue)
  }
  return colors
}

function finish(id: MoonId, geometry: THREE.BufferGeometry) {
  geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors(id, geometry.getAttribute('position').array), 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

async function readShape(id: MoonId) {
  const res = await fetch(shapeUrl(id))
  if (!res.ok) throw new Error(`${id} shape: ${res.status}`)
  let bytes = await res.arrayBuffer()
  // Stored gzipped; a server that already unzipped it on the way (Content-Encoding) hands over the raw data
  const head = new Uint8Array(bytes, 0, 2)
  if (head[0] === 0x1f && head[1] === 0x8b) {
    bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  }
  const view = new DataView(bytes)
  const vertexCount = view.getUint32(0, true)
  const triangleCount = view.getUint32(4, true)
  const step = view.getFloat32(8, true)
  const packed = new Int16Array(bytes, 12, vertexCount * 3)
  const deltas = new Int32Array(bytes, 12 + Math.ceil((vertexCount * 6) / 4) * 4, triangleCount * 3)

  const positions = new Float32Array(vertexCount * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < positions.length; i += 3) {
    toGlobeAxes(packed[i] * step, packed[i + 1] * step, packed[i + 2] * step, v)
    positions[i] = v.x
    positions[i + 1] = v.y
    positions[i + 2] = v.z
  }
  const indices = new Uint32Array(deltas.length)
  let index = 0
  for (let i = 0; i < deltas.length; i++) indices[i] = index += deltas[i]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return finish(id, geometry)
}

const loads = new Map<MoonId, Promise<THREE.BufferGeometry>>()

/**
 * The moon's measured shape, downloaded and built once and kept; later calls share it. The home page starts
 * this early so the globe usually has it on arrival. A globe that disposes it simply uploads it again.
 */
export function loadMoonGeometry(id: MoonId) {
  let load = loads.get(id)
  if (!load) {
    load = readShape(id)
    // Let a failed download be tried again next time
    load.catch(() => loads.delete(id))
    loads.set(id, load)
  }
  return load
}

const placeholders = new Map<MoonId, THREE.BufferGeometry>()

/** A plain ellipsoid of the moon's size, shown until the measured shape arrives (or if it can't load). */
export function getPlaceholderGeometry(id: MoonId) {
  let geometry = placeholders.get(id)
  if (!geometry) {
    const [long, middle, short] = MOON_RADII[id]
    geometry = finish(id, new THREE.SphereGeometry(1, 48, 32).scale(middle, short, long).deleteAttribute('normal').deleteAttribute('uv'))
    placeholders.set(id, geometry)
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
