// Procedural equirectangular Mars texture, used when no image is found in /resources.
// Noise is sampled on the unit sphere so there is no seam at the antimeridian.

function hash(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const fade = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function valueNoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi)
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz)
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  )
}

function fbm(x: number, y: number, z: number, octaves: number) {
  let sum = 0, amp = 0.5, freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, z * freq)
    freq *= 2.03
    amp *= 0.5
  }
  return sum
}

// Approximate albedo features: [lat, lonEast, radius°, strength (+dark / -bright)]
const ALBEDO: [number, number, number, number][] = [
  [8, 70, 14, 0.55], // Syrtis Major
  [45, -30, 18, 0.4], // Acidalia Planitia
  [-25, -40, 20, 0.35], // Mare Erythraeum
  [-15, 20, 22, 0.35], // Sinus Meridiani / Sabaeus
  [-20, 110, 20, 0.3], // Mare Tyrrhenum
  [-42, 70, 16, -0.45], // Hellas basin (bright)
  [5, -110, 25, -0.3], // Tharsis (dusty, bright)
  [20, 160, 22, -0.25], // Elysium / Amazonis
]

export function createMarsTextures(width = 1024) {
  const height = width / 2
  const color = document.createElement('canvas')
  const bump = document.createElement('canvas')
  color.width = bump.width = width
  color.height = bump.height = height
  const cctx = color.getContext('2d')!
  const bctx = bump.getContext('2d')!
  const cimg = cctx.createImageData(width, height)
  const bimg = bctx.createImageData(width, height)
  const rad = Math.PI / 180

  const albedoVecs = ALBEDO.map(([lat, lon, r, s]) => ({
    x: Math.cos(lat * rad) * Math.cos(lon * rad),
    y: Math.sin(lat * rad),
    z: Math.cos(lat * rad) * Math.sin(lon * rad),
    cosR: Math.cos(r * rad),
    s,
  }))

  for (let j = 0; j < height; j++) {
    const lat = 90 - ((j + 0.5) / height) * 180
    const cl = Math.cos(lat * rad), sl = Math.sin(lat * rad)
    for (let i = 0; i < width; i++) {
      const lon = ((i + 0.5) / width) * 360 - 180
      const x = cl * Math.cos(lon * rad), z = cl * Math.sin(lon * rad), y = sl

      const warp = fbm(x * 2 + 11, y * 2 + 3, z * 2 + 7, 3) - 0.5
      let dark = (fbm(x * 3 + warp, y * 3 + warp, z * 3, 5) - 0.5) * 1.5
      for (const a of albedoVecs) {
        const d = x * a.x + y * a.y + z * a.z
        if (d > a.cosR - 0.15) dark += a.s * 1.4 * Math.min(1, (d - (a.cosR - 0.15)) / 0.15) * (0.7 + warp * 1.5)
      }
      // Valles Marineris: a dark gash along ~-10° from 80°W to 40°W
      if (lat > -16 && lat < -4 && lon > -82 && lon < -38) {
        dark += 0.35 * (1 - Math.abs(lat + 10) / 6) * (0.7 + warp)
      }
      const detail = fbm(x * 18, y * 18, z * 18, 4)
      const height01 = Math.min(1, Math.max(0, 0.5 - dark * 0.5 + (detail - 0.5) * 0.6))

      const t = Math.min(1, Math.max(0, 0.5 + dark))
      let r = lerp(214, 92, t) + (detail - 0.5) * 40
      let g = lerp(128, 48, t) + (detail - 0.5) * 26
      let b = lerp(82, 34, t) + (detail - 0.5) * 18

      // Polar caps with a ragged edge
      const capEdge = (lat > 0 ? 78 : -80) + (fbm(x * 9, y * 9, z * 9, 3) - 0.5) * 10
      const cap = lat > 0 ? lat - capEdge : capEdge - lat
      if (cap > -3) {
        const k = Math.min(1, (cap + 3) / 4)
        r = lerp(r, 238, k); g = lerp(g, 232, k); b = lerp(b, 226, k)
      }

      const p = (j * width + i) * 4
      cimg.data[p] = r; cimg.data[p + 1] = g; cimg.data[p + 2] = b; cimg.data[p + 3] = 255
      const hv = height01 * 255
      bimg.data[p] = bimg.data[p + 1] = bimg.data[p + 2] = hv; bimg.data[p + 3] = 255
    }
  }
  cctx.putImageData(cimg, 0, 0)
  bctx.putImageData(bimg, 0, 0)

  // Scatter craters, stretched horizontally to stay round on the sphere
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let n = 0; n < 420; n++) {
    const lat = Math.asin(rand() * 1.8 - 0.9) / rad
    const lon = rand() * 360 - 180
    const size = Math.pow(rand(), 4) * width * 0.012 + 1.2
    const cx = ((lon + 180) / 360) * width
    const cy = ((90 - lat) / 180) * height
    const sx = 1 / Math.max(0.2, Math.cos(lat * rad))
    for (const [ctx, rim, pit] of [
      [cctx, 'rgba(240,190,150,0.12)', 'rgba(60,28,18,0.28)'],
      [bctx, 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0.45)'],
    ] as const) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(sx, 1)
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size)
      grad.addColorStop(0, pit)
      grad.addColorStop(0.75, 'rgba(0,0,0,0)')
      grad.addColorStop(0.9, rim)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, size, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  return { color, bump }
}

// Generating the surface takes a moment, so every map and globe shares one copy.
let cache: ReturnType<typeof createMarsTextures> | null = null
export function getMarsTextures() {
  return (cache ??= createMarsTextures(1024))
}
