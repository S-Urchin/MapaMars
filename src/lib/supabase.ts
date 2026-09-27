import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Set these in .env.local (see supabase/schema.sql for the database setup)
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  console.error('Supabase is not configured: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to MapaMars/.env.local and restart the dev server.')
}

// One client per page. During development, hot reloads re-run this module; reusing the client
// stops several auth clients from fighting over the same stored session.
const globalStore = globalThis as { __mapaMarsSupabase?: SupabaseClient }

export const supabase = (globalStore.__mapaMarsSupabase ??= createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: {
    // PKCE puts the email-confirmation code in the query string, which leaves our #/ routes alone
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}))
