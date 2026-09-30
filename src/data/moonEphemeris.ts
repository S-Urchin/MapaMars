// Live Phobos and Deimos positions from JPL Horizons, fetched through /api/horizons (see api/horizons.ts).
// Each table holds a few days of Mars-centred positions and velocities every 15 minutes; between rows the
// path is interpolated, which stays well under a kilometre of Horizons. When a table isn't available
// (offline, still loading, or the API is down) the built-in orbit model in marsSky.ts stands in.

import type { HorizonsTable } from '../../api/horizons'
import { daysSinceJ2000, icrfToMei, moonPosition, type MoonId, type Vec3 } from './marsSky'

const MOONS: MoonId[] = ['phobos', 'deimos']
/** Fetch a new table once less than this many days of it are left ahead of now (a Deimos lap is 1.26 days). */
const REFRESH_AHEAD_DAYS = 1.5
/** After a failed fetch, wait this long before trying again. */
const RETRY_MS = 10 * 60 * 1000

const tables = new Map<MoonId, HorizonsTable>()
let loading = false
let failedAt = -Infinity
let version = 0

/** Changes whenever new tables arrive, so drawings based on positions can be refreshed. */
export const ephemerisVersion = () => version

/** True while the moons are placed from Horizons data rather than the built-in model. */
export const moonsFromHorizons = () => tables.size === MOONS.length

const tableEnd = (t: HorizonsTable) => t.start + t.step * (t.rows.length - 1)

/** Make sure tables covering the next day or so are loaded or on their way; cheap to call every frame. */
export function ensureMoonEphemeris(nowMs: number) {
  const d = daysSinceJ2000(nowMs)
  const fresh = MOONS.every((id) => {
    const t = tables.get(id)
    return t && t.start <= d && tableEnd(t) - d > REFRESH_AHEAD_DAYS
  })
  if (fresh || loading || nowMs - failedAt < RETRY_MS) return
  loading = true
  // Start the day before (UTC) so the table also covers the recent past; the same day for every visitor,
  // so the server's cached copy is reused
  const day = new Date(nowMs - 86_400_000).toISOString().slice(0, 10)
  Promise.all(MOONS.map(async (id) => {
    const res = await fetch(`/api/horizons?moon=${id}&day=${day}`)
    if (!res.ok) throw new Error(`Horizons ${id}: ${res.status}`)
    return (await res.json()) as HorizonsTable
  }))
    .then((loaded) => {
      for (const t of loaded) tables.set(t.moon, t)
      version++
    })
    .catch((err) => {
      failedAt = nowMs
      console.warn('Moon positions: using the built-in orbit model.', err)
    })
    .finally(() => { loading = false })
}

/** Moon position relative to Mars's centre, km, MEI: from Horizons when loaded, else the built-in model. */
export function livePosition(id: MoonId, d: number): Vec3 {
  const t = tables.get(id)
  const x = t ? (d - t.start) / t.step : -1
  if (!t || x < 0 || x > t.rows.length - 1) return moonPosition(id, d)
  const k = Math.min(Math.floor(x), t.rows.length - 2)
  const u = x - k
  const a = t.rows[k], b = t.rows[k + 1]
  // Cubic Hermite between the two rows, from positions and velocities (velocities scaled to one row step)
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u
  const h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2
  const icrf: Vec3 = [0, 1, 2].map((i) => h00 * a[i] + h10 * t.step * a[i + 3] + h01 * b[i] + h11 * t.step * b[i + 3]) as Vec3
  return icrfToMei(icrf, d)
}
