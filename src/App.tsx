import { useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Cloud,
  Globe2,
  Menu,
  Radio,
  Satellite,
  Search,
  Settings2,
  Sun,
  X,
} from 'lucide-react'
import './App.css'
import { featuredMissions, type Mission } from './services/nasaApi'

function App() {
  const [activeFilter, setActiveFilter] = useState('All missions')
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const filters = ['All missions', 'Earth science', 'Deep space']
  const visibleMissions = featuredMissions.filter((mission) => {
    if (activeFilter === 'All missions') return true
    return mission.category === activeFilter
  })

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Orbit home">
          <span className="brand-mark"><Satellite size={18} /></span>
          <span>ORBIT<span className="brand-dot">.</span></span>
        </a>
        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
          <a className="active" href="#missions">Missions</a>
          <a href="#earth">Earth data</a>
          <a href="#briefings">Briefings</a>
        </nav>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search">
            <Search size={18} />
          </button>
          <button className="avatar" type="button" aria-label="Open profile">AR</button>
          <button className="mobile-menu icon-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {searchOpen && <div className="search-panel"><Search size={18} /><input autoFocus placeholder="Search missions, objects, events..." /><kbd>ESC</kbd></div>}

      <section className="hero-grid" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse-dot" /> Live mission intelligence</div>
          <h1>LOOK UP.<br /><em>LOOK CLOSER.</em></h1>
          <p className="hero-description">A clearer view of our changing planet and the universe beyond it, powered by open NASA data.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#missions">Explore missions <ArrowUpRight size={16} /></a>
            <a className="text-link" href="#briefings">Read today's briefing <ArrowUpRight size={15} /></a>
          </div>
        </div>
        <div className="orbital-visual" aria-label="Stylized view of Earth from orbit">
          <div className="orbit-line orbit-one" /><div className="orbit-line orbit-two" />
          <div className="planet"><div className="planet-glow" /><div className="continent continent-one" /><div className="continent continent-two" /><div className="continent continent-three" /></div>
          <div className="satellite-pin"><Radio size={13} /></div>
          <div className="visual-label label-top">34.7° N <span>48° W</span></div>
          <div className="visual-label label-bottom"><span className="live-indicator" /> Earth view / 01</div>
        </div>
      </section>

      <section className="dashboard-section" id="missions">
        <div className="section-heading"><div><p className="section-kicker">01 / In focus</p><h2>Mission control</h2></div><button className="select-button" type="button">Updated every 15 min <ChevronDown size={15} /></button></div>
        <div className="filter-row" role="tablist" aria-label="Mission filters">
          {filters.map((filter) => <button key={filter} type="button" className={activeFilter === filter ? 'filter active' : 'filter'} onClick={() => setActiveFilter(filter)}>{filter}</button>)}
        </div>
        <div className="mission-grid">
          {visibleMissions.map((mission) => <MissionCard key={mission.title} mission={mission} />)}
        </div>
      </section>

      <section className="signal-strip" id="earth">
        <div className="signal-title"><span className="section-kicker">02 / Right now</span><h2>Planetary signal</h2></div>
        <div className="signal-stat"><Globe2 size={20} /><div><strong>14,284</strong><span>Earth observations today</span></div></div>
        <div className="signal-stat"><Sun size={20} /><div><strong>12 active</strong><span>Solar events monitored</span></div></div>
        <div className="signal-stat"><Cloud size={20} /><div><strong>82%</strong><span>Global cloud coverage</span></div></div>
      </section>

      <section className="briefing-section" id="briefings">
        <div><p className="section-kicker">03 / Field notes</p><h2>Today's briefing</h2><p className="briefing-copy">The northern lights may be visible farther south tonight. A recent solar flare sent a wave of charged particles toward Earth, making aurora forecasts unusually active.</p><a className="text-link" href="#briefings">Open full briefing <ArrowUpRight size={15} /></a></div>
        <div className="briefing-meta"><CalendarDays size={17} /><span>21 September 2026</span><span className="meta-divider" /><Activity size={17} /><span>Solar weather / Moderate</span></div>
      </section>

      <footer><div className="footer-brand"><span className="brand-mark"><Satellite size={16} /></span> ORBIT.</div><span>Built for curious minds on Earth.</span><div className="footer-links"><a href="#top">About</a><a href="#top">Data sources</a><a href="#top"><Settings2 size={15} /> Settings</a><a href="#top"><CircleHelp size={15} /> Help</a></div></footer>
    </main>
  )
}

function MissionCard({ mission }: { mission: Mission }) {
  return <article className="mission-card"><div className={`mission-image ${mission.imageClass}`}><span className="mission-status"><span /> {mission.status}</span><span className="mission-type">{mission.type}</span><div className="image-grid" /></div><div className="mission-content"><div className="mission-header"><span>{mission.agency}</span><span>{mission.updated}</span></div><h3>{mission.title}</h3><p>{mission.description}</p><a href="#briefings" className="card-link">View mission <ArrowUpRight size={15} /></a></div></article>
}

export default App
