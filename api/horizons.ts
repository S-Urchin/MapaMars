// Phobos and Deimos positions from JPL Horizons (https://ssd-api.jpl.nasa.gov/doc/horizons.html).
// Horizons sends no CORS headers, so the browser can't call it directly: this runs as a Vercel function
// in production and as dev-server middleware locally (see vite.config.ts).
// Only fixed queries go out: the caller picks a moon and a start day, nothing else, so this can't be
// used as an open proxy. Responses are cached for a day, so Horizons sees a few requests a day at most.

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const MOON_CODES = { phobos: '401', deimos: '402' } as const
/** Each table covers this many days from the start day, sampled every STEP_MINUTES. */
const WINDOW_DAYS = 4
const STEP_MINUTES = 15
const SECONDS_PER_DAY = 86400

export type HorizonsTable = {
  moon: keyof typeof MOON_CODES
  /** Days since J2000.0 (TDB) of the first row */
  start: number
  /** Days between rows */
  step: number
  /** Mars-centred ICRF state per row: x, y, z in km, then vx, vy, vz in km/day */
  rows: number[][]
}

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const moon = params.get('moon')
  const day = params.get('day') ?? ''
  if (moon !== 'phobos' && moon !== 'deimos') return json({ error: 'moon must be phobos or deimos' }, 400, 'no-store')
  const dayMs = Date.parse(`${day}T00:00:00Z`)
  // A calendar day within a year of today: enough for the live globe, and keeps the cache small
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(dayMs) || Math.abs(dayMs - Date.now()) > 366 * SECONDS_PER_DAY * 1000) {
    return json({ error: 'day must be YYYY-MM-DD within a year of today' }, 400, 'no-store')
  }
  const stop = new Date(dayMs + WINDOW_DAYS * SECONDS_PER_DAY * 1000).toISOString().slice(0, 10)
  const query = new URLSearchParams({
    format: 'json',
    COMMAND: `'${MOON_CODES[moon]}'`,
    CENTER: "'500@499'",
    EPHEM_TYPE: "'VECTORS'",
    REF_PLANE: "'FRAME'",
    REF_SYSTEM: "'ICRF'",
    VEC_TABLE: "'2'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
    OBJ_DATA: "'NO'",
    START_TIME: `'${day}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${STEP_MINUTES} m'`,
  })

  try {
    const upstream = await fetch(`${HORIZONS_URL}?${query}`, { signal: AbortSignal.timeout(15000) })
    if (!upstream.ok) return json({ error: `Horizons answered ${upstream.status}` }, 502, 'no-store')
    const body = (await upstream.json()) as { result?: string; error?: string }
    const table = body.result?.split('$$SOE')[1]?.split('$$EOE')[0]
    if (!table) return json({ error: body.error ?? 'Horizons returned no ephemeris' }, 502, 'no-store')
    // Rows: JDTDB, calendar date, X, Y, Z, VX, VY, VZ (km, km/s)
    const parsed = table.trim().split('\n').map((line) => line.split(',').map((cell) => cell.trim()))
    const rows = parsed.map((r) => [+r[2], +r[3], +r[4], +r[5] * SECONDS_PER_DAY, +r[6] * SECONDS_PER_DAY, +r[7] * SECONDS_PER_DAY])
    if (rows.length < 2 || rows.some((r) => r.some((v) => !Number.isFinite(v)))) {
      return json({ error: 'Could not read the Horizons table' }, 502, 'no-store')
    }
    const result: HorizonsTable = { moon, start: +parsed[0][0] - 2451545, step: STEP_MINUTES / (24 * 60), rows }
    return json(result, 200, 'public, max-age=3600, s-maxage=86400')
  } catch (err) {
    return json({ error: `Horizons unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502, 'no-store')
  }
}
