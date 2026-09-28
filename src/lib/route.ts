import type { MapPoint } from '../components/MarsMap2D'
import { marsDistanceKm } from '../data/mars'

/** A named point on a Marswalk: the start, a phase, or the end. */
export type RouteStop = { name: string; lat: number; lon: number }

export type Leg = { from: string; to: string; km: number }

/**
 * Map markers in walking order: A (start), 1…n (phases), B (end).
 * Points that aren't set yet (null) are skipped but keep their numbering.
 */
export function routeMarkers(start: RouteStop | null, phases: (RouteStop | null)[], end: RouteStop | null): MapPoint[] {
  const markers: MapPoint[] = []
  if (start) markers.push({ ...start, key: 'start', badge: 'A', label: start.name, variant: 'start' })
  phases.forEach((p, i) => {
    if (p) markers.push({ ...p, key: `phase-${i}`, badge: String(i + 1), label: p.name, variant: 'phase' })
  })
  if (end) markers.push({ ...end, key: 'end', badge: 'B', label: end.name, variant: 'end' })
  return markers
}

/** Straight-line legs between consecutive stops, and their total. */
export function routeLegs(stops: RouteStop[]): { legs: Leg[]; totalKm: number } {
  const legs = stops.slice(1).map((to, i) => ({ from: stops[i].name, to: to.name, km: marsDistanceKm(stops[i], to) }))
  return { legs, totalKm: legs.reduce((sum, l) => sum + l.km, 0) }
}
