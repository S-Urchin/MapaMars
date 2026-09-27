import { supabase } from '../lib/supabase'

export type User = { id: string; username: string; isAdmin: boolean }

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/

// Supabase's messages, reworded for people using the site
function friendly(message: string) {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Wrong email or password'
  if (m.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with that email already exists. Try signing in.'
  if (m.includes('database error saving new user')) return 'That username is taken. Pick another one.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a few minutes and try again.'
  if (m.includes('failed to fetch')) return 'Could not reach Supabase. Check your connection.'
  return message
}

/** Loads the public profile (username, admin flag) for a signed-in account. */
export async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from('profiles').select('id, username, is_admin').eq('id', userId).maybeSingle()
  if (error) throw new Error(friendly(error.message))
  return data ? { id: data.id, username: data.username, isAdmin: data.is_admin } : null
}

async function usernameTaken(username: string) {
  // Escape LIKE wildcards so the case-insensitive match is exact
  const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await supabase.from('profiles').select('id').ilike('username', pattern).limit(1)
  if (error) throw new Error(friendly(error.message))
  return data.length > 0
}

/** Returns true when the account still needs its email confirmed before signing in. */
export async function signUp(email: string, username: string, password: string): Promise<{ needsConfirmation: boolean }> {
  if (!USERNAME_PATTERN.test(username)) throw new Error('Username must be 3–24 letters, numbers, - or _')
  if (password.length < 8) throw new Error('Password must be at least 8 characters')
  if (await usernameTaken(username)) throw new Error('That username is taken. Pick another one.')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The confirmation link brings people back here; this URL must be allowed in Supabase (Authentication -> URL Configuration)
    options: { data: { username }, emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  })
  if (error) throw new Error(friendly(error.message))
  // With email confirmation on, Supabase hides whether the email already exists by returning a user with no identities
  if (data.user && data.user.identities?.length === 0) throw new Error('An account with that email already exists. Try signing in.')
  return { needsConfirmation: !data.session }
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(friendly(error.message))
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(friendly(error.message))
}
