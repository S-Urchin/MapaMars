import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/context'
import { useHash } from '../../hooks/useHash'
import { fetchMissionByCode, MISSION_CODE_PATTERN, type MissionLog } from '../../services/missionLogs'
import { FindMission } from './FindMission'
import { MissionForm } from './MissionForm'
import { MissionView } from './MissionView'
import { go, missionPath } from './shared'

type Screen =
  | { kind: 'find' }
  | { kind: 'new' }
  | { kind: 'view'; code: string }
  | { kind: 'edit'; code: string }

// #/missions, #/missions/new, #/missions/ABC-123, #/missions/ABC-123/edit
function parse(hash: string): Screen {
  const [, segment, action] = hash.replace(/^#\/missions\/?/, '#/').split('/')
  if (!segment) return { kind: 'find' }
  if (segment === 'new') return { kind: 'new' }
  const code = decodeURIComponent(segment).toUpperCase()
  if (!MISSION_CODE_PATTERN.test(code)) return { kind: 'find' }
  return action === 'edit' ? { kind: 'edit', code } : { kind: 'view', code }
}

type Lookup = { code: string; status: 'found' | 'missing' | 'error'; mission?: MissionLog; error?: string }

export function MissionsPage() {
  const { user, loading: authLoading } = useAuth()
  const screen = parse(useHash())
  const code = screen.kind === 'view' || screen.kind === 'edit' ? screen.code : null
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Load the mission whenever the code in the address changes.
  // Until the result for this code arrives, `current` below is null, which shows the loading state.
  useEffect(() => {
    if (!code) return
    const controller = new AbortController()
    fetchMissionByCode(code, controller.signal)
      .then((mission) => setLookup(mission ? { code, status: 'found', mission } : { code, status: 'missing' }))
      .catch((err: Error) => { if (err.name !== 'AbortError') setLookup({ code, status: 'error', error: err.message }) })
    return () => controller.abort()
  }, [code])

  const current = lookup && lookup.code === code ? lookup : null
  const canManage = (m: MissionLog) => !!user && (m.ownerId === user.id || user.isAdmin)

  const saved = (m: MissionLog) => {
    setLookup({ code: m.code, status: 'found', mission: m })
    setNotice(null)
    go(missionPath(m.code))
  }

  const deleted = (m: MissionLog) => {
    setLookup(null)
    setNotice(`Mission ${m.code} was deleted.`)
    go(missionPath())
  }

  if (screen.kind === 'new') {
    return <MissionForm user={user} authLoading={authLoading} onSaved={saved} onCancel={() => go(missionPath())} />
  }

  if (code && !current) {
    return <main className="mission-center"><p className="muted">Opening mission {code}…</p></main>
  }

  if (code && current?.status === 'found' && current.mission) {
    const mission = current.mission
    if (screen.kind === 'edit' && canManage(mission)) {
      return <MissionForm user={user} authLoading={authLoading} mission={mission} onSaved={saved} onCancel={() => go(missionPath(mission.code))} />
    }
    return <MissionView mission={mission} canManage={canManage(mission)} onDeleted={deleted} />
  }

  const problem = current?.status === 'missing'
    ? `No mission found with code ${code}.`
    : current?.status === 'error'
      ? current.error ?? 'Could not open that mission.'
      : null

  return <FindMission user={user} initialCode={code ?? ''} problem={problem} notice={notice} onDismissNotice={() => setNotice(null)} />
}
