import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * NASA's 3D model of Mars (NASA/JPL-Caltech), from https://science.nasa.gov/resource/planet-mars-3d-model/.
 * A colour map and a normal map laid out as the six faces of a cube, on a low-detail rounded cube.
 */
export const MARS_MODEL_URL = '/resources/mars-nasa.glb'
export const MARS_MODEL_CREDIT = 'Mars 3D model: NASA/JPL-Caltech'

// The model is 1000 units across the equator and slightly flattened at the poles, like Mars itself
const MODEL_RADIUS = 500

export type MarsModel = { geometry: THREE.BufferGeometry; map: THREE.Texture; normalMap: THREE.Texture | null }

let pending: Promise<MarsModel> | null = null

/** Load and prepare the model once; later calls share the result. */
export function loadMarsModel() {
  pending ??= new GLTFLoader().loadAsync(MARS_MODEL_URL).then((gltf) => {
    let mesh: THREE.Mesh | undefined
    gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh })
    if (!mesh) throw new Error('No mesh in the Mars model')
    const source = mesh.material as THREE.MeshStandardMaterial
    if (!source.map) throw new Error('The Mars model has no colour map')
    mesh.updateWorldMatrix(true, false)
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    // Model axes: north +y, 0° longitude along -x, 90°E along +z. The globe puts 0° along +x and 90°E
    // along -z (see latLonToVector in MarsGlobe), so turn it half a turn about the pole, and scale to radius 1.
    geometry.rotateY(Math.PI).scale(1 / MODEL_RADIUS, 1 / MODEL_RADIUS, 1 / MODEL_RADIUS)
    geometry.computeBoundingBox()
    const polar = geometry.boundingBox!.max.y
    return { geometry: smoothSphere(geometry, polar, 2), map: source.map, normalMap: source.normalMap }
  })
  return pending
}

/**
 * The model has only ~3,000 triangles, so its outline turns polygonal close up. Split every triangle into
 * four, `levels` times over, pushing the new corners out onto the planet's surface (a sphere of radius 1,
 * flattened to `polar` at the poles). Texture coordinates are split along with them, so the map lands
 * exactly where the original model put it.
 */
function smoothSphere(source: THREE.BufferGeometry, polar: number, levels: number) {
  const g = source.index ? source.toNonIndexed() : source
  let pos = Array.from(g.getAttribute('position').array as Float32Array)
  let uv = Array.from(g.getAttribute('uv').array as Float32Array)
  const onSurface = (x: number, y: number, z: number) => {
    // Distance to the flattened sphere along this direction
    const r = 1 / Math.sqrt(x * x + z * z + (y * y) / (polar * polar))
    return [x * r, y * r, z * r]
  }
  for (let level = 0; level < levels; level++) {
    const nextPos: number[] = []
    const nextUv: number[] = []
    for (let t = 0; t < pos.length / 9; t++) {
      const p = (k: number) => [pos[t * 9 + k * 3], pos[t * 9 + k * 3 + 1], pos[t * 9 + k * 3 + 2]]
      const q = (k: number) => [uv[t * 6 + k * 2], uv[t * 6 + k * 2 + 1]]
      const [a, b, c] = [p(0), p(1), p(2)]
      const [ua, ub, uc] = [q(0), q(1), q(2)]
      const mid = (m: number[], n: number[]) => onSurface((m[0] + n[0]) / 2, (m[1] + n[1]) / 2, (m[2] + n[2]) / 2)
      const midUv = (m: number[], n: number[]) => [(m[0] + n[0]) / 2, (m[1] + n[1]) / 2]
      const [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)]
      const [uab, ubc, uca] = [midUv(ua, ub), midUv(ub, uc), midUv(uc, ua)]
      for (const [x, y, z, u, v, w] of [[a, ab, ca, ua, uab, uca], [ab, b, bc, uab, ub, ubc], [ca, bc, c, uca, ubc, uc], [ab, bc, ca, uab, ubc, uca]]) {
        nextPos.push(...x, ...y, ...z)
        nextUv.push(...u, ...v, ...w)
      }
    }
    pos = nextPos
    uv = nextUv
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  // Surface normals of the flattened sphere, smooth everywhere (no creases along the old triangles)
  const normals = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) {
    const n = new THREE.Vector3(pos[i], pos[i + 1] / (polar * polar), pos[i + 2]).normalize()
    normals.set([n.x, n.y, n.z], i)
  }
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  out.computeBoundingSphere()
  return out
}
