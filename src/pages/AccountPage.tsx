import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { PasswordInput } from '../components/PasswordInput'
import { PASSWORD_MAX_LENGTH, PASSWORD_RULES, passwordIsStrong } from '../services/auth'

export function AccountPage() {
  const { user, loading, signIn, signUp, signOut } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
        window.location.hash = '#/missions'
      } else {
        const { needsConfirmation } = await signUp(email.trim(), username.trim(), password)
        if (needsConfirmation) setConfirmSentTo(email.trim())
        else window.location.hash = '#/missions'
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = () => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setError(null)
  }

  const clearError = () => setError(null)

  if (loading) return <main className="account-page"><p className="muted">Loading…</p></main>

  if (user) {
    return (
      <main className="account-page">
        <h1>Signed in</h1>
        <p className="muted">You're signed in as <strong className="plain">{user.username}</strong>{user.isAdmin && ' (admin)'}.</p>
        <div className="account-actions">
          <a className="button" href="#/missions">Go to missions</a>
          <button type="button" className="button-outline" onClick={() => signOut()}>Sign out</button>
        </div>
      </main>
    )
  }

  if (confirmSentTo) {
    return (
      <main className="account-page">
        <h1>Check your email</h1>
        <p className="muted">
          We sent a confirmation link to <strong className="plain">{confirmSentTo}</strong>. Open it to activate your account, then sign in.
        </p>
        <button type="button" className="button-outline" onClick={() => { setConfirmSentTo(null); setMode('signin'); setPassword('') }}>
          Back to sign in
        </button>
      </main>
    )
  }

  return (
    <main className="account-page">
      <h1>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h1>
      <p className="muted">
        {mode === 'signin' ? 'Sign in to log missions and manage the ones you created.' : 'Your username is shown on every mission you log. Your email stays private.'}
      </p>
      <form className="mission-form" onSubmit={submit}>
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearError() }} autoComplete="email" required />
        </label>
        {mode === 'signup' && (
          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); clearError() }}
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_\-]{3,24}"
              title="3–24 letters, numbers, - or _"
            />
            <em className="muted">3–24 letters, numbers, - or _</em>
          </label>
        )}
        <label>
          <span>Password</span>
          <PasswordInput
            value={password}
            onChange={(value) => { setPassword(value); clearError() }}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            maxLength={PASSWORD_MAX_LENGTH}
            describedBy={mode === 'signup' ? 'password-rules' : undefined}
          />
        </label>
        {mode === 'signup' && (
          <ul className="password-rules" id="password-rules" aria-label="Password requirements">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password)
              return (
                <li key={rule.label} className={met ? 'is-met' : ''}>
                  <span className="rule-mark" aria-hidden="true">{met ? '✓' : '○'}</span>
                  {rule.label}
                  <span className="visually-hidden">{met ? ' (done)' : ' (not yet)'}</span>
                </li>
              )
            })}
          </ul>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button
          className="button"
          type="submit"
          disabled={busy || !email.trim() || !password || (mode === 'signup' && (!username.trim() || !passwordIsStrong(password)))}
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="muted switch-mode">
        {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
        <button type="button" className="link-button" onClick={switchMode}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button>
      </p>
    </main>
  )
}
