import { createClient } from '@supabase/supabase-js'

// Set these in .env.local (see supabase/schema.sql for the database setup)
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  console.error('Supabase is not configured: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to MapaMars/.env.local and restart the dev server.')
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: {
    // PKCE puts the email-confirmation code in the query string, which leaves our #/ routes alone
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
