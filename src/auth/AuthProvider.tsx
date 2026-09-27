import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { fetchProfile, signIn, signOut, signUp, type User } from '../services/auth'
import { AuthContext, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let latest = 0

    const load = async (userId: string | null) => {
      const request = ++latest
      let next: User | null = null
      if (userId) {
        try { next = await fetchProfile(userId) } catch { next = null }
      }
      if (!cancelled && request === latest) {
        setUser(next)
        setLoading(false)
      }
    }

    // Fires once with the stored session, then on every sign-in, sign-out and token refresh.
    // Supabase advises against awaiting other Supabase calls inside this callback, so defer the profile load.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return
      setTimeout(() => load(session?.user.id ?? null), 0)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    // Load the profile before resolving so pages see the signed-in user straight away
    signIn: async (email, password) => {
      await signIn(email, password)
      const { data } = await supabase.auth.getUser()
      if (data.user) setUser(await fetchProfile(data.user.id))
    },
    signUp: async (email, username, password) => {
      const result = await signUp(email, username, password)
      if (!result.needsConfirmation) {
        const { data } = await supabase.auth.getUser()
        if (data.user) setUser(await fetchProfile(data.user.id))
      }
      return result
    },
    signOut: async () => {
      await signOut()
      setUser(null)
    },
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
