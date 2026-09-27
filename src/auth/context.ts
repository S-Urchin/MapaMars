import { createContext, useContext } from 'react'
import type { User } from '../services/auth'

export type AuthState = {
  user: User | null
  /** True until the first check of the session has finished. */
  loading: boolean
  /** Accepts an email address or a username. */
  signIn: (emailOrUsername: string, password: string) => Promise<void>
  /** Resolves with needsConfirmation = true when the account must confirm its email first. */
  signUp: (email: string, username: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
