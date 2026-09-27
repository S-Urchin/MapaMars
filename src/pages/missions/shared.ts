import { landingSites, landmarks } from '../../data/mars'

export const presets = [
  ...landmarks.map((l) => ({ value: `lm:${l.name}`, name: l.name, lat: l.lat, lon: l.lon, group: 'Landmarks' })),
  ...landingSites.map((s) => ({ value: `ls:${s.id}`, name: `${s.location} (${s.mission})`, lat: s.lat, lon: s.lon, group: 'Landing sites' })),
]

export const CUSTOM_TARGET = 'custom'

export const missionPath = (code?: string, action?: 'edit') => ['#/missions', code, action].filter(Boolean).join('/')

/** Address for a mission opened from the browse list, where you don't know its code. */
export const missionIdPath = (id: string) => `#/missions/m/${id}`

export function go(path: string) {
  window.location.hash = path
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
export function timeAgo(iso: string, now: Date) {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  return 'just now'
}
