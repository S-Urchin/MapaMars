type SiteStatus = 'ACTIVE' | 'ENDED' | 'RETIRED'

export type LandingSite = {
  id: string
  mission: string
  location: string
  lat: number // planetocentric, degrees north
  lon: number // degrees east, -180..180
  landed: number
  status: SiteStatus
  note: string
}

export const landingSites: LandingSite[] = [
  { id: 'm2020', mission: 'Perseverance', location: 'Jezero Crater', lat: 18.44, lon: 77.45, landed: 2021, status: 'ACTIVE', note: 'Caching rock cores from an ancient river delta for future sample return.' },
  { id: 'msl', mission: 'Curiosity', location: 'Gale Crater', lat: -4.59, lon: 137.44, landed: 2012, status: 'ACTIVE', note: 'Climbing the layered slopes of Mount Sharp to read Mars’ climate history.' },
  { id: 'insight', mission: 'InSight', location: 'Elysium Planitia', lat: 4.5, lon: 135.62, landed: 2018, status: 'RETIRED', note: 'Seismometer recorded over 1,300 marsquakes before power loss in 2022.' },
  { id: 'mer-b', mission: 'Opportunity', location: 'Meridiani Planum', lat: -1.95, lon: -5.53, landed: 2004, status: 'ENDED', note: 'Planned for 90 sols, drove 45 km over nearly 15 years.' },
  { id: 'mer-a', mission: 'Spirit', location: 'Gusev Crater', lat: -14.57, lon: 175.47, landed: 2004, status: 'ENDED', note: 'Found silica deposits pointing to past hot springs.' },
  { id: 'phx', mission: 'Phoenix', location: 'Vastitas Borealis', lat: 68.22, lon: -125.75, landed: 2008, status: 'ENDED', note: 'Scraped up and confirmed water ice just below the arctic soil.' },
  { id: 'mpf', mission: 'Pathfinder', location: 'Ares Vallis', lat: 19.13, lon: -33.22, landed: 1997, status: 'ENDED', note: 'Delivered Sojourner, the first rover to drive on another planet.' },
  { id: 'vl1', mission: 'Viking 1', location: 'Chryse Planitia', lat: 22.27, lon: -47.95, landed: 1976, status: 'ENDED', note: 'First successful US Mars landing; returned the first surface panoramas.' },
]

// Well-known places to aim a logged mission at
export const landmarks: { name: string; lat: number; lon: number }[] = [
  { name: 'Olympus Mons', lat: 18.65, lon: -133.8 },
  { name: 'Valles Marineris', lat: -13.9, lon: -59.2 },
  { name: 'Hellas Planitia', lat: -42.4, lon: 70.5 },
  { name: 'Elysium Mons', lat: 24.8, lon: 146.9 },
  { name: 'Utopia Planitia', lat: 46.7, lon: 117.5 },
  { name: 'North polar cap', lat: 85, lon: 0 },
  { name: 'South polar cap', lat: -85, lon: 0 },
]

const MS_PER_DAY = 86_400_000

/** Mars Sol Date and Coordinated Mars Time (Allison & McEwen 2000, Mars24 algorithm). */
export function marsClock(date: Date) {
  const jdUT = date.getTime() / MS_PER_DAY + 2440587.5
  const jdTT = jdUT + 69.184 / 86400
  const msd = (jdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626
  const mtc = (((msd % 1) + 1) % 1) * 24
  return { msd, mtc }
}

/** Local mean solar time at an east longitude, in hours. */
export function localMeanSolarTime(mtc: number, lonEast: number) {
  return (((mtc + lonEast / 15) % 24) + 24) % 24
}

/**
 * Rough Earth–Mars distance from circular orbits with J2000 mean longitudes.
 * Good to ~10%, enough for an indicative one-way light time.
 */
export function earthMarsDistanceAU(date: Date) {
  const d = date.getTime() / MS_PER_DAY + 2440587.5 - 2451545.0
  const rad = Math.PI / 180
  const le = (100.464 + 0.9856474 * d) * rad
  const lm = (355.453 + 0.5240208 * d) * rad
  const am = 1.5237
  const dx = am * Math.cos(lm) - Math.cos(le)
  const dy = am * Math.sin(lm) - Math.sin(le)
  return Math.hypot(dx, dy)
}

export const AU_LIGHT_MIN = 8.3167

export function formatHours(h: number) {
  const total = Math.floor(h * 3600)
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':')
}

export function formatLat(lat: number, digits = 2) {
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? 'N' : 'S'}`
}

export function formatLon(lon: number, digits = 2) {
  return `${Math.abs(lon).toFixed(digits)}°${lon >= 0 ? 'E' : 'W'}`
}

/** Mean radius of Mars in km. */
export const MARS_RADIUS_KM = 3389.5

/** Straight-line (great-circle) distance across the surface, in km. Ignores terrain. */
export function marsDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * MARS_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 2 : 1)} km`
}

export function formatUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
}
