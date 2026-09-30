// Sky geometry around Mars: the planet's rotation, the Sun, Phobos and Deimos.
// Vectors are in km in the Mars equatorial inertial frame (MEI): z is Mars's north pole and
// x the ascending node of Mars's equator on the ICRF equator (the IAU prime-meridian reference).
// Body-fixed coordinates are MEI turned by the rotation angle W, so east longitude = MEI longitude - W.
// Self-contained on purpose: no imports, so the math can be checked outside the app.

export type Vec3 = [number, number, number]

const RAD = Math.PI / 180
const MS_PER_DAY = 86_400_000
const J2000_JD = 2451545.0

export const MARS_RADIUS_KM = 3389.5
export const MARS_EQUATOR_RADIUS_KM = 3396.19
const SUN_RADIUS_KM = 695_700
const AU_KM = 149_597_870.7

/** IAU (2009) Mars rotation rate, degrees per day; one turn is the sidereal day. */
export const MARS_ROTATION_DEG_PER_DAY = 350.89198226
export const SIDEREAL_DAY_S = (360 / MARS_ROTATION_DEG_PER_DAY) * 86400
export const SOL_S = 88775.244
export const AXIAL_TILT_DEG = 25.19

/** Days since J2000.0 in Terrestrial Time (close enough to TDB here). */
export function daysSinceJ2000(ms: number) {
  return ms / MS_PER_DAY + 2440587.5 + 69.184 / 86400 - J2000_JD
}

// Vector helpers
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: Vec3) => scale(a, 1 / len(a))

// Passive rotations (they re-express a vector in a turned frame); negate the angle for the inverse.
function rotX(v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD)
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]
}
function rotZ(v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD)
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]]
}

/** ICRF into the frame of a plane whose pole is at (ra, dec), x along its ascending node on the ICRF equator. */
const icrfToPlane = (v: Vec3, ra: number, dec: number) => rotX(rotZ(v, 90 + ra), 90 - dec)
const planeToIcrf = (v: Vec3, ra: number, dec: number) => rotZ(rotX(v, -(90 - dec)), -(90 + ra))

/** Mars pole and prime meridian (IAU 2009 report). */
function marsPole(d: number) {
  const T = d / 36525
  return { ra: 317.68143 - 0.1061 * T, dec: 52.8865 - 0.0609 * T }
}

/** Rotation angle W of Mars's prime meridian, degrees, 0..360. */
export function marsRotationDeg(d: number) {
  return (((176.63 + MARS_ROTATION_DEG_PER_DAY * d) % 360) + 360) % 360
}

const icrfToMei = (v: Vec3, d: number) => {
  const p = marsPole(d)
  return icrfToPlane(v, p.ra, p.dec)
}

/** MEI vector to body-fixed (x toward 0°E, z north). */
export const meiToBodyFixed = (v: Vec3, d: number) => rotZ(v, marsRotationDeg(d))

export function toLatLon(v: Vec3) {
  const n = norm(v)
  return { lat: Math.asin(n[2]) / RAD, lon: Math.atan2(n[1], n[0]) / RAD }
}

export function latLonToBodyFixed(lat: number, lon: number, r = MARS_RADIUS_KM): Vec3 {
  return [r * Math.cos(lat * RAD) * Math.cos(lon * RAD), r * Math.cos(lat * RAD) * Math.sin(lon * RAD), r * Math.sin(lat * RAD)]
}

function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return E
}

/** Position in a plane frame from classical elements (angles in degrees, M in degrees). */
function orbitPosition(a: number, e: number, i: number, node: number, peri: number, M: number): Vec3 {
  const E = solveKepler(M * RAD, e)
  const x = a * (Math.cos(E) - e)
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E)
  // Active rotation perifocal -> plane: Rz(node) Rx(i) Rz(peri)
  return rotZ(rotX(rotZ([x, y, 0], -peri), -i), -node)
}

/**
 * Direction of the Sun from Mars (unit, MEI) and the Sun–Mars distance in AU.
 * Mars heliocentric orbit from JPL's approximate planetary elements (Standish, valid 1800–2050).
 */
export function sunFromMars(d: number) {
  const T = d / 36525
  const a = 1.52371034 + 0.00001847 * T
  const e = 0.0933941 + 0.00007882 * T
  const I = 1.84969142 - 0.00813131 * T
  const L = -4.55343205 + 19140.30268499 * T
  const peri = -23.94362959 + 0.44441088 * T
  const node = 49.55953891 - 0.29257343 * T
  const ecl = orbitPosition(a, e, I, node, peri - node, L - peri)
  const eps = 23.43928
  const icrf = rotX(ecl, -eps)
  const au = len(icrf)
  return { dir: norm(icrfToMei(scale(icrf, -1), d)), au }
}

/** Apparent angular radius of the Sun seen from Mars, degrees. */
export const sunAngularRadiusDeg = (au: number) => Math.asin(SUN_RADIUS_KM / (au * AU_KM)) / RAD

// Moons

export type MoonId = 'phobos' | 'deimos'

type MoonElements = {
  a: number; e: number; i: number
  node0: number; peri0: number; M0: number
  /** Mean motion, deg/day */
  n: number
  /** Apsidal and nodal precession periods, years (node regresses) */
  pPeri: number; pNode: number
  /** Laplace plane pole, ICRF degrees */
  lapRa: number; lapDec: number
}

/**
 * JPL SSD mean orbital elements (ephemeris MAR099), epoch J2000, referred to each moon's Laplace plane;
 * node is measured from the Laplace plane's node on the ICRF equator. The published table is rounded to
 * 0.1°, so predicted transits land on the right day or within a few days of rover observations (2004–2022).
 */
export const MOON_ELEMENTS: Record<MoonId, MoonElements> = {
  phobos: { a: 9375, e: 0.015, i: 1.1, node0: 169.2, peri0: 216.3, M0: 189.7, n: 1128.8445566, pPeri: 1.1, pNode: 2.3, lapRa: 317.7, lapDec: 52.9 },
  deimos: { a: 23457, e: 0, i: 1.8, node0: 54.3, peri0: 0, M0: 205.0, n: 285.1618875, pPeri: 0, pNode: 56.2, lapRa: 316.6, lapDec: 53.5 },
}

/** Tri-axial radii in km: long (toward Mars), middle (along the orbit), short (toward the pole). */
export const MOON_RADII: Record<MoonId, Vec3> = {
  phobos: [13.0, 11.4, 9.1],
  deimos: [7.8, 6.0, 5.1],
}
export const MOON_MEAN_RADIUS_KM: Record<MoonId, number> = { phobos: 11.08, deimos: 6.2 }

/** Moon position relative to Mars's centre, km, MEI. */
export function moonPosition(id: MoonId, d: number): Vec3 {
  const el = MOON_ELEMENTS[id]
  const years = d / 365.25
  const node = el.node0 - (el.pNode ? (360 * years) / el.pNode : 0)
  const peri = el.peri0 + (el.pPeri ? (360 * years) / el.pPeri : 0)
  const M = el.M0 + el.n * d
  const lap = orbitPosition(el.a, el.e, el.i, node, peri, M)
  return icrfToMei(planeToIcrf(lap, el.lapRa, el.lapDec), d)
}

/** Sampled orbit path (MEI, km) for drawing, frozen at time d. */
export function moonOrbitPath(id: MoonId, d: number, steps = 256): Vec3[] {
  const el = MOON_ELEMENTS[id]
  const period = 360 / el.n
  return Array.from({ length: steps + 1 }, (_, k) => moonPosition(id, d + (k / steps) * period))
}

export const moonPeriodDays = (id: MoonId) => 360 / MOON_ELEMENTS[id].n

/** True when the moon is inside Mars's shadow (a cylinder is close enough at these distances). */
export function inMarsShadow(pos: Vec3, sunDir: Vec3) {
  const along = dot(pos, sunDir)
  if (along > 0) return false
  return len(sub(pos, scale(sunDir, along))) < MARS_RADIUS_KM
}

export type MoonShadow = {
  /** Ground point at the shadow's centre, MEI km */
  center: Vec3
  /** Penumbra radius on the ground (perpendicular to the Sun), km */
  radiusKm: number
  /** Share of the Sun's disk covered at the centre, 0..1 */
  coverage: number
}

/** Where a moon's shadow lands on Mars, or null when it misses the planet. */
export function moonShadow(id: MoonId, d: number, sunDir: Vec3, sunAu: number, pos = moonPosition(id, d)): MoonShadow | null {
  // Ray from the moon away from the Sun, against a sphere of Mars's radius
  const dir = scale(sunDir, -1)
  const b = dot(pos, dir)
  const c = dot(pos, pos) - MARS_RADIUS_KM ** 2
  const disc = b * b - c
  if (disc < 0 || b > 0) return null
  const t = -b - Math.sqrt(disc)
  const center: Vec3 = [pos[0] + dir[0] * t, pos[1] + dir[1] * t, pos[2] + dir[2] * t]
  const sunSpread = t * Math.tan(sunAngularRadiusDeg(sunAu) * RAD)
  const r = MOON_MEAN_RADIUS_KM[id]
  return { center, radiusKm: r + sunSpread, coverage: Math.min(1, (r / sunSpread) ** 2) }
}

/**
 * Share of the Sun's disk a moon can see past Mars: 1 in full sunlight, 0 in Mars's umbra, and in between
 * in the penumbra, so an eclipse fades in and out instead of switching.
 */
export function sunVisibleFromMoon(pos: Vec3, sunDir: Vec3, sunAu: number) {
  const dist = len(pos)
  const marsRadius = Math.asin(Math.min(1, MARS_RADIUS_KM / dist)) / RAD
  const sunRadius = sunAngularRadiusDeg(sunAu)
  const sep = Math.acos(Math.max(-1, Math.min(1, dot(scale(pos, -1 / dist), sunDir)))) / RAD
  return 1 - overlapArea(sunRadius, marsRadius, sep) / (Math.PI * sunRadius * sunRadius)
}

/** Direction of the Sun seen from a place on Mars, as east, north and up components of a unit vector. */
export function sunLocalDirection(lat: number, lon: number, ms: number) {
  const d = daysSinceJ2000(ms)
  const s = meiToBodyFixed(sunFromMars(d).dir, d)
  const la = lat * RAD, lo = lon * RAD
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0]
  const north: Vec3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)]
  return { east: dot(s, east), north: dot(s, north), up: dot(s, up) }
}

/** Moon shadow at a moment, from Unix ms. */
export function moonShadowAt(id: MoonId, ms: number) {
  const d = daysSinceJ2000(ms)
  const sun = sunFromMars(d)
  return moonShadow(id, d, sun.dir, sun.au)
}

/** First time at or after fromMs that the moon's shadow falls on Mars, searched minute by minute. */
export function nextShadowOnMars(id: MoonId, fromMs: number, horizonDays = 5) {
  for (let t = fromMs; t < fromMs + horizonDays * MS_PER_DAY; t += 60_000) {
    if (moonShadowAt(id, t)) return t
  }
  return null
}

// Seen from a place on the surface

export function sunElevationDeg(lat: number, lon: number, d: number) {
  const site = latLonToBodyFixed(lat, lon)
  const sun = meiToBodyFixed(sunFromMars(d).dir, d)
  return Math.asin(dot(norm(site), sun)) / RAD
}

/** Angle between the Sun and the moon's centre as seen from the site, degrees, plus the moon's angular radius. */
function transitGeometry(id: MoonId, siteBf: Vec3, d: number) {
  const sun = sunFromMars(d)
  const sunBf = meiToBodyFixed(sun.dir, d)
  const moonBf = meiToBodyFixed(moonPosition(id, d), d)
  const toMoon = sub(moonBf, siteBf)
  const dist = len(toMoon)
  const sep = Math.acos(Math.max(-1, Math.min(1, dot(norm(toMoon), sunBf)))) / RAD
  return {
    sep,
    moonRadius: Math.asin(MOON_MEAN_RADIUS_KM[id] / dist) / RAD,
    sunRadius: sunAngularRadiusDeg(sun.au),
    sunElevation: Math.asin(dot(norm(siteBf), sunBf)) / RAD,
  }
}

export type TransitEvent = {
  moon: MoonId
  /** Unix ms of first contact, deepest point and last contact */
  start: number
  peak: number
  end: number
  /** Share of the Sun's disk covered at the deepest point, 0..1 (approximate) */
  coverage: number
}

/**
 * Upper bounds on how fast things move across the sky seen from the surface, deg/s: each moon against
 * the Sun (the moon's own motion plus the Sun's), and the Sun's change in elevation.
 */
const MAX_SKY_RATE: Record<MoonId, number> = { phobos: 0.03, deimos: 0.008 }
const MAX_SUN_RATE = 0.0045

/** Next time the moon crosses the Sun seen from the site, searched up to `horizonDays` ahead. */
export function nextTransit(id: MoonId, lat: number, lon: number, fromMs: number, horizonDays = 120): TransitEvent | null {
  const site = latLonToBodyFixed(lat, lon)
  const endMs = fromMs + horizonDays * MS_PER_DAY
  const touching = (ms: number) => {
    const g = transitGeometry(id, site, daysSinceJ2000(ms))
    return g.sunElevation > 0 && g.sep < g.sunRadius + g.moonRadius ? g : null
  }
  let prev = fromMs
  for (let t = fromMs; t < endMs; ) {
    const g = transitGeometry(id, site, daysSinceJ2000(t))
    // Jump ahead by the least time the Sun needs to rise, or the moon needs to reach the Sun
    const gap = g.sunElevation <= 0 ? -g.sunElevation / MAX_SUN_RATE : (g.sep - g.sunRadius - g.moonRadius) / MAX_SKY_RATE[id]
    if (gap > 0) {
      prev = t
      t += Math.max(1000, gap * 1000)
      continue
    }
    // Touching: the first contact lies after the last sample, so scan second by second from there
    let start = 0, end = 0, peak = 0, best = Infinity, peakGeom = g
    for (let s = prev; ; s += 1000) {
      const hit = touching(s)
      if (!hit) { if (start) break; continue }
      if (!start) start = s
      end = s
      if (hit.sep < best) { best = hit.sep; peak = s; peakGeom = hit }
    }
    const { sunRadius: rs, moonRadius: rm } = peakGeom
    // Area of the Sun's disk hidden by the moon's disk at the deepest point
    const coverage = Math.min(1, overlapArea(rs, rm, best) / (Math.PI * rs * rs))
    return { moon: id, start, peak, end, coverage }
  }
  return null
}

/** Area where two circles overlap (radii r1, r2, centres dist apart). */
function overlapArea(r1: number, r2: number, dist: number) {
  if (dist >= r1 + r2) return 0
  if (dist <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2
  const a = r1 * r1 * Math.acos((dist * dist + r1 * r1 - r2 * r2) / (2 * dist * r1))
  const b = r2 * r2 * Math.acos((dist * dist + r2 * r2 - r1 * r1) / (2 * dist * r2))
  const c = 0.5 * Math.sqrt((-dist + r1 + r2) * (dist + r1 - r2) * (dist - r1 + r2) * (dist + r1 + r2))
  return a + b - c
}

// Seasons (Mars24, Allison & McEwen 2000)

/** Areocentric solar longitude Ls, degrees 0..360. */
export function solarLongitude(ms: number) {
  const dt = daysSinceJ2000(ms)
  const M = (19.3871 + 0.52402073 * dt) * RAD
  const alpha = 270.3871 + 0.524038496 * dt
  const vm = (10.691 + 3e-7 * dt) * Math.sin(M) + 0.623 * Math.sin(2 * M) + 0.05 * Math.sin(3 * M) + 0.005 * Math.sin(4 * M) + 0.0005 * Math.sin(5 * M)
  return (((alpha + vm) % 360) + 360) % 360
}

export function seasonName(ls: number) {
  const north = ['spring', 'summer', 'autumn', 'winter'][Math.floor(ls / 90) % 4]
  const south = ['autumn', 'winter', 'spring', 'summer'][Math.floor(ls / 90) % 4]
  return `Northern ${north} · southern ${south}`
}

/** Sub-solar point on Mars (planetocentric, east longitude). */
export function subsolarPoint(ms: number) {
  const d = daysSinceJ2000(ms)
  return toLatLon(meiToBodyFixed(sunFromMars(d).dir, d))
}
