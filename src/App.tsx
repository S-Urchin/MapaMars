import { useEffect, useState } from 'react'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { AccountPage } from './pages/AccountPage'
import { GlobePage } from './pages/GlobePage'
import { HomePage } from './pages/HomePage'
import { MissionsPage } from './pages/missions/MissionsPage'

const routes = [
  { hash: '#/', label: 'Home', page: HomePage, inNav: true },
  { hash: '#/missions', label: 'Missions', page: MissionsPage, inNav: true },
  { hash: '#/globe', label: 'Globe', page: GlobePage, inNav: true },
  { hash: '#/account', label: 'Account', page: AccountPage, inNav: false },
]

// Pages can have sub-paths, e.g. #/missions/ABC-123 belongs to #/missions
function readRoute() {
  const hash = window.location.hash
  return routes.find((r) => r.hash !== '#/' && (hash === r.hash || hash.startsWith(`${r.hash}/`))) ?? routes[0]
}

function AccountLink({ current }: { current: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return (
    <a href="#/account" className={`nav-account${current ? ' is-current' : ''}`} aria-current={current ? 'page' : undefined}>
      {user ? user.username : 'Sign in'}
    </a>
  )
}

function App() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const onHashChange = () => {
      setRoute(readRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const Page = route.page

  return (
    <AuthProvider>
      <div className="app">
        <header className="nav">
          <a className="nav-brand" href="#/">MAPA MARS</a>
          <nav className="nav-links" aria-label="Main">
            {routes.filter((r) => r.inNav).map((r) => (
              <a key={r.hash} href={r.hash} className={r === route ? 'is-current' : ''} aria-current={r === route ? 'page' : undefined}>{r.label}</a>
            ))}
            <AccountLink current={route.hash === '#/account'} />
          </nav>
        </header>

        <Page />
      </div>
    </AuthProvider>
  )
}

export default App
