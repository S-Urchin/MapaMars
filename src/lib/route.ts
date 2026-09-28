import type { MapPoint } from '../components/MarsMap2D'
import { marsDistanceKm } from '../data/mars'

/** A named point on a Marswalk: the start, a phase, or the end. */
export type RouteStop = { name: string; lat: number; lon: number }

export type Leg = { from: string; to: string; km: number }

/**
 * Map markers in walking order: A (start), 1…n (phases), B (end).
 * A round trip has no B: A is both the start and the finish.
 * Points that aren't set yet (null) are skipped but keep their numbering.
 */
export function routeMarkers(start: RouteStop | null, phases: (RouteStop | null)[], end: RouteStop | null, round = false): MapPoint[] {
  const markers: MapPoint[] = []
  if (start) {
    const label = !round ? start.name : start.name === 'Start' ? 'Start & finish' : `${start.name} · start & finish`
    markers.push({ ...start, key: 'start', badge: 'A', label, variant: 'start' })
  }
  phases.forEach((p, i) => {
    if (p) markers.push({ ...p, key: `phase-${i}`, badge: String(i + 1), label: p.name, variant: 'phase' })
  })
  if (end && !round) markers.push({ ...end, key: 'end', badge: 'B', label: end.name, variant: 'end' })
  return markers
}

/** Stops in walking order; a round trip finishes back at the start. */
export function routeStops(start: RouteStop, phases: RouteStop[], end: RouteStop, round = false): RouteStop[] {
  return round ? [start, ...phases, start] : [start, ...phases, end]
}

/** Straight-line legs between consecutive stops, and their total. */
export function routeLegs(stops: RouteStop[]): { legs: Leg[]; totalKm: number } {
  const legs = stops.slice(1).map((to, i) => ({ from: stops[i].name, to: to.name, km: marsDistanceKm(stops[i], to) }))
  return { legs, totalKm: legs.reduce((sum, l) => sum + l.km, 0) }
}
