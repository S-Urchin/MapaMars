import { MarsGlobe, type GlobeLayers } from '../components/MarsGlobe'
import { AU_LIGHT_MIN, earthMarsDistanceAU, formatHours, landingSites, marsClock } from '../data/mars'
import { useNow } from '../hooks/useNow'

const PREVIEW_LAYERS: GlobeLayers = { grid: false, sites: false, orbits: false, rotate: true }

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
    text: 'Plan your own mission, pick a target on the globe, and give it a code like MRS-204. Share the code so others can open it.',
  },
]

export function HomePage() {
  const now = useNow()
  const { msd, mtc } = marsClock(now)
  const lightMinutes = earthMarsDistanceAU(now) * AU_LIGHT_MIN

  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <h1>Mars, up close.</h1>
          <p>An interactive 3D globe of the red planet. Find where every NASA lander touched down and see what time it is there right now.</p>
          <a className="button" href="#/globe">Open the globe →</a>
        </div>
        <div className="hero-globe" aria-hidden="true">
          <MarsGlobe layers={PREVIEW_LAYERS} interactive={false} />
        </div>
      </section>

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
