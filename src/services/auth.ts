import { supabase } from '../lib/supabase'

export type User = { id: string; username: string; isAdmin: boolean }

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/

// Keep these in step with Supabase: Authentication -> Sign In / Providers -> Email
// (minimum length 10, "lowercase, uppercase letters, digits and symbols").
export const PASSWORD_MAX_LENGTH = 72 // Supabase's bcrypt limit
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 10 characters', test: (p) => p.length >= 10 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A symbol, like ! ? # or @', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
]

export const passwordIsStrong = (p: string) => p.length <= PASSWORD_MAX_LENGTH && PASSWORD_RULES.every((r) => r.test(p))

// Supabase's messages, reworded for people using the site
function friendly(message: string) {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Wrong email or password'
  if (m.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with that email already exists. Try signing in.'
  if (m.includes('database error saving new user')) return 'That username is taken. Pick another one.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a few minutes and try again.'
  if (m.includes('failed to fetch') || m === '{}') {
    return 'The request to Supabase did not complete. If your connection is fine, check Supabase → Logs → Auth for the error, or try disabling ad blockers for this site.'
  }
  return message
}

// Keep the raw error in the console so failures can be diagnosed (status, code, name)
function fail(error: { message: string }): never {
  console.error('[auth]', error)
  throw new Error(friendly(error.message))
}

/** Loads the public profile (username, admin flag) for a signed-in account. */
export async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from('profiles').select('id, username, is_admin').eq('id', userId).maybeSingle()
  if (error) fail(error)
  return data ? { id: data.id, username: data.username, isAdmin: data.is_admin } : null
}

async function usernameTaken(username: string) {
  // Escape LIKE wildcards so the case-insensitive match is exact
  const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await supabase.from('profiles').select('id').ilike('username', pattern).limit(1)
  if (error) fail(error)
  return data.length > 0
}

/** Returns true when the account still needs its email confirmed before signing in. */
export async function signUp(email: string, username: string, password: string): Promise<{ needsConfirmation: boolean }> {
  if (!USERNAME_PATTERN.test(username)) throw new Error('Username must be 3–24 letters, numbers, - or _')
  if (password.length > PASSWORD_MAX_LENGTH) throw new Error(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`)
  const missing = PASSWORD_RULES.filter((r) => !r.test(password))
  if (missing.length) throw new Error(`Password needs: ${missing.map((r) => r.label.toLowerCase()).join(', ')}`)
  if (await usernameTaken(username)) throw new Error('That username is taken. Pick another one.')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The confirmation link brings people back here; this URL must be allowed in Supabase (Authentication -> URL Configuration)
    options: { data: { username }, emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  })
  if (error) fail(error)
  // With email confirmation on, Supabase hides whether the email already exists by returning a user with no identities
  if (data.user && data.user.identities?.length === 0) throw new Error('An account with that email already exists. Try signing in.')
  return { needsConfirmation: !data.session }
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) fail(error)
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) fail(error)
}
