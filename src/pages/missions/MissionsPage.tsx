import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/context'
import { useHash } from '../../hooks/useHash'
import { fetchMissionByCode, fetchMissionById, MISSION_CODE_PATTERN, type MissionLog } from '../../services/missionLogs'
import { FindMission } from './FindMission'
import { MissionForm } from './MissionForm'
import { MissionView } from './MissionView'
import { go, missionPath } from './shared'

type Screen =
  | { kind: 'find' }
  | { kind: 'new' }
  | { kind: 'view'; key: string; code?: string; id?: string }
  | { kind: 'edit'; key: string; code: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// #/missions                   browse + enter a code
// #/missions/new               create
// #/missions/ABC-123           open by code (can join)
// #/missions/ABC-123/edit      edit (author)
// #/missions/m/<id>            open from the browse list (no code needed to look)
function parse(hash: string): Screen {
  const [, segment, action] = hash.replace(/^#\/missions\/?/, '#/').split('/')
  if (!segment) return { kind: 'find' }
  if (segment === 'new') return { kind: 'new' }
  if (segment === 'm' && action && UUID.test(action)) return { kind: 'view', key: `id:${action}`, id: action }
  const code = decodeURIComponent(segment).toUpperCase()
  if (!MISSION_CODE_PATTERN.test(code)) return { kind: 'find' }
  return action === 'edit' ? { kind: 'edit', key: `code:${code}`, code } : { kind: 'view', key: `code:${code}`, code }
}

type Lookup = { key: string; status: 'found' | 'missing' | 'error'; mission?: MissionLog; error?: string }

export function MissionsPage() {
  const { user, loading: authLoading } = useAuth()
  const screen = parse(useHash())
  const key = screen.kind === 'view' || screen.kind === 'edit' ? screen.key : null
  const code = screen.kind === 'view' || screen.kind === 'edit' ? screen.code : undefined
  const id = screen.kind === 'view' ? screen.id : undefined
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Load the mission whenever the address changes (and again after signing in or out,
  // since that changes whether you may see its code).
  // Until the result for this address arrives, `current` below is null, which shows the loading state.
  const userId = user?.id
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const load = code ? fetchMissionByCode(code, controller.signal) : fetchMissionById(id!, controller.signal)
    load
      .then((mission) => setLookup(mission ? { key, status: 'found', mission } : { key, status: 'missing' }))
      .catch((err: Error) => { if (err.name !== 'AbortError') setLookup({ key, status: 'error', error: err.message }) })
    return () => controller.abort()
  }, [key, code, id, userId])

  const current = lookup && lookup.key === key ? lookup : null
  const canManage = (m: MissionLog) => !!user && (m.ownerId === user.id || user.isAdmin)

  const saved = (m: MissionLog) => {
    setLookup({ key: `code:${m.code}`, status: 'found', mission: m })
    setNotice(null)
    go(missionPath(m.code ?? undefined))
  }

  const deleted = (m: MissionLog) => {
    setLookup(null)
    setNotice(`Mission ${m.code ?? m.name} was deleted.`)
    go(missionPath())
  }

  if (screen.kind === 'new') {
    return <MissionForm user={user} authLoading={authLoading} onSaved={saved} onCancel={() => go(missionPath())} />
  }

  if (key && !current) {
    return <main className="mission-center"><p className="muted">Opening mission{code ? ` ${code}` : ''}…</p></main>
  }

  if (key && current?.status === 'found' && current.mission) {
    const mission = current.mission
    if (screen.kind === 'edit' && canManage(mission)) {
      return <MissionForm user={user} authLoading={authLoading} mission={mission} onSaved={saved} onCancel={() => go(missionPath(mission.code ?? undefined))} />
    }
    return (
      <MissionView
        mission={mission}
        knownCode={code ?? mission.code}
        user={user}
        canManage={canManage(mission)}
        onChanged={(m) => setLookup({ key: key, status: 'found', mission: m })}
        onDeleted={deleted}
      />
    )
  }

  const problem = current?.status === 'missing'
    ? code ? `No mission found with code ${code}.` : 'That mission doesn’t exist or isn’t public.'
    : current?.status === 'error'
      ? current.error ?? 'Could not open that mission.'
      : null

  return <FindMission user={user} initialCode={code ?? ''} problem={problem} notice={notice} onDismissNotice={() => setNotice(null)} />
}
