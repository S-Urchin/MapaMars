import type { CSSProperties, ReactNode } from 'react'
import type { LandingSite } from '../../data/mars'
import { formatLat, formatLon } from '../../data/mars'
import { moonInfo } from '../../data/marsMoons'
import { moonPeriodDays, type MoonId } from '../../data/marsSky'

// Small line icons, drawn in the current text colour
const paths: Record<string, ReactNode> = {
  tools: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  labels: <><circle cx="7" cy="12" r="2.5" /><path d="M12 10h8M12 14h5" /></>,
  orbits: <><ellipse cx="12" cy="12" rx="9" ry="4" /><circle cx="12" cy="12" r="2.5" /></>,
  grid: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c-3 3-3 13 0 16M12 4c3 3 3 13 0 16" /></>,
  shadows: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4h4" /></>,
  back: <path d="M14 6l-6 6 6 6" />,
  rotate: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v4h-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  live: <><circle cx="12" cy="12" r="3" fill="currentColor" /><circle cx="12" cy="12" r="8" /></>,
}

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export type Tool = { id: string; label: string; icon: keyof typeof paths; on?: boolean; onClick: () => void }

type ToolDockProps = { open: boolean; onToggle: () => void; tools: Tool[] }

/** Bottom-left button that slides a row of tool buttons out to its right. */
export function ToolDock({ open, onToggle, tools }: ToolDockProps) {
  return (
    <div className={`tool-dock${open ? ' is-open' : ''}`}>
      <button type="button" className="tool-dock-toggle" onClick={onToggle} aria-expanded={open} aria-controls="tool-tray" aria-label={open ? 'Close tools' : 'Open tools'} title={open ? 'Close tools' : 'Tools'}>
        <Icon name={open ? 'close' : 'tools'} />
      </button>
      <div id="tool-tray" className="tool-tray" role="toolbar" aria-label="Globe tools" inert={!open}>
        {tools.map((t, i) => (
          <button
            key={t.id}
            type="button"
            className={`tool${t.on ? ' is-on' : ''}`}
            style={{ '--i': i } as CSSProperties}
            aria-pressed={t.on === undefined ? undefined : t.on}
            onClick={t.onClick}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const statusText = { ACTIVE: 'Active', RETIRED: 'Retired', ENDED: 'Mission ended' }

type SiteCardProps = {
  site: LandingSite
  /** The site has a 3D close-up to fly down to (Viking 1) */
  canExplore: boolean
  diving: boolean
  onExplore: () => void
  onClose: () => void
}

/** Brief background for a landing site, shown on the globe only. */
export function SiteCard({ site, canExplore, diving, onExplore, onClose }: SiteCardProps) {
  return (
    <aside className="info-card" aria-label={`${site.mission} landing site`}>
      <button type="button" className="info-card-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      <p className="info-card-kicker">Landing site · {site.landed}</p>
      <h2>{site.mission}</h2>
      <p className="muted">{site.location} · {formatLat(site.lat, 1)} {formatLon(site.lon, 1)}</p>
      <p className="info-card-text">{site.note}</p>
      <p className="info-card-status">{statusText[site.status]}</p>
      {canExplore && (
        <button type="button" className="button info-card-action" onClick={onExplore} disabled={diving}>
          {diving ? 'Descending…' : 'Explore landing site'}
        </button>
      )}
    </aside>
  )
}

/** Brief background for Phobos or Deimos. */
export function MoonCard({ id, onClose }: { id: MoonId; onClose: () => void }) {
  const info = moonInfo[id]
  const periodH = moonPeriodDays(id) * 24
  return (
    <aside className="info-card" aria-label={info.name}>
      <button type="button" className="info-card-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      <p className="info-card-kicker">Moon · {info.designation}</p>
      <h2>{info.name}</h2>
      <p className="muted">{info.meaning}</p>
      <dl className="info-card-facts">
        <dt>Size</dt><dd>{info.size}</dd>
        <dt>Orbits Mars every</dt><dd>{Math.floor(periodH)} h {Math.round((periodH % 1) * 60)} min</dd>
        <dt>Discovered</dt><dd>{info.discovered}</dd>
      </dl>
      <p className="info-card-text">{info.background[0]}</p>
    </aside>
  )
}
