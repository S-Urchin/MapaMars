import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { Hyperspace } from '../components/Hyperspace'
import { getMarsTextures } from '../components/marsTexture'
import { AU_LIGHT_MIN, earthMarsDistanceAU, formatHours, landingSites, marsClock } from '../data/mars'
import { useNow } from '../hooks/useNow'
import { markWarpArrival } from '../lib/warp'

const features = [
  {
    title: 'Explore Mars in 3D',
    text: 'Drag to spin the planet and scroll to zoom. Hover anywhere on the surface to read its latitude and longitude.',
  },
  {
    title: 'Visit landing sites',
    text: `${landingSites.length} NASA landers and rovers, from Viking 1 to Perseverance, placed at their published coordinates. Pick one to fly the camera there.`,
  },
  {
    title: 'Read Mars time',
    text: 'See the local solar time at every site, the current sol, and how long a signal takes to travel from Mars to Earth.',
  },
  {
    title: 'Log a mission',
    text: 'Plan a mission, pick a target on the globe, and give it a code like MRS-204. Browse other missions and their crews, and join one with its code.',
  },
]

// Matches the text-recede animation in App.css.
const LEAVE_MS = 900

export function HomePage() {
  const now = useNow()
  const { msd, mtc } = marsClock(now)
  const lightMinutes = earthMarsDistanceAU(now) * AU_LIGHT_MIN
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'warping'>('idle')

  useEffect(() => {
    if (phase !== 'leaving') return
    const id = setTimeout(() => setPhase('warping'), LEAVE_MS)
    return () => clearTimeout(id)
  }, [phase])

  // Build the globe texture ahead of time so the globe can appear the instant the jump ends.
  useEffect(() => {
    const id = setTimeout(getMarsTextures, 300)
    return () => clearTimeout(id)
  }, [])

  const openGlobe = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    e.preventDefault()
    setPhase('leaving')
  }

  const arrive = useCallback(() => {
    markWarpArrival()
    window.location.hash = '#/globe'
  }, [])

  return (
    <main className={`home${phase !== 'idle' ? ' is-leaving' : ''}`}>
      <section className="hero">
        <div className="hero-copy">
          <h1>Mars, up close.</h1>
          <p>An interactive 3D globe of the red planet. Find where every NASA lander touched down and see what time it is there right now.</p>
          <a className="button" href="#/globe" onClick={openGlobe}>Open the globe →</a>
        </div>
      </section>
      {phase === 'warping' && <Hyperspace onDone={arrive} />}

      <section className="features" aria-label="What you can do">
        {features.map((f, i) => (
          <article key={f.title} className="feature">
            <span className="feature-num">0{i + 1}</span>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <section className="now" aria-label="Right now on Mars">
        <h2>Right now on Mars</h2>
        <dl className="stats">
          <div><dt>Sol</dt><dd>{Math.floor(msd).toLocaleString()}</dd></div>
          <div><dt>Mars time</dt><dd>{formatHours(mtc)}</dd></div>
          <div><dt>Signal delay</dt><dd>~{lightMinutes.toFixed(1)} min</dd></div>
        </dl>
        <p className="note">Mars time is Coordinated Mars Time, the Martian equivalent of UTC. Signal delay is an estimate.</p>
      </section>
    </main>
  )
}
