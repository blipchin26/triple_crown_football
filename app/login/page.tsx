'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { goAfterAuth } from '../../lib/redirect'
import Crown from '../Crown'
import s from '../styles'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkingConfirm, setCheckingConfirm] = useState(false)
  const inflight = useRef(false)   // stops two sign-in attempts overlapping

  // Go home as soon as a session exists (already signed in, or email just confirmed in another tab)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) goAfterAuth(router)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) goAfterAuth(router)
    })
    return () => subscription.unsubscribe()
  }, [router])

  // While waiting for email confirmation: same-device links sign this tab in by themselves (session polling).
  // If the link was opened on ANOTHER device (e.g. your phone), no session ever reaches this tab, but the account is
  // confirmed by then, so we sign in with the password you just typed, as soon as you come back to this tab.
  async function tryConfirmedLogin(showMessage: boolean) {
    if (!sentTo || inflight.current) return
    inflight.current = true
    if (showMessage) { setCheckingConfirm(true); setError(''); setInfo('') }
    const { error } = await supabase.auth.signInWithPassword({ email: sentTo, password })
    inflight.current = false
    setCheckingConfirm(false)
    if (!error) return goAfterAuth(router)
    if (showMessage) {
      if (/not confirmed/i.test(error.message)) setInfo('Not confirmed yet. Open the link in the email first, then tap this again.')
      else setError(error.message)
    }
  }

  useEffect(() => {
    if (!sentTo) return
    // same-device link: a session appears in this browser
    const sessionPoll = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) goAfterAuth(router)
    }, 2000)
    // other-device link: try the password every 15s while this tab is visible (20 per 5 min, under Supabase's
    // sign-in limit), for up to 15 minutes. A not-yet-confirmed account just returns an error we ignore.
    let tries = 0
    const loginPoll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (++tries > 75) { clearInterval(loginPoll); return }
      tryConfirmedLogin(false)
    }, 15000)
    const onVisible = () => { if (document.visibilityState === 'visible') tryConfirmedLogin(false) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(sessionPoll)
      clearInterval(loginPoll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentTo, router, password])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) setError(error.message)
      else if (data.session) goAfterAuth(router)
      else setSentTo(email)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else goAfterAuth(router)
    }
    setBusy(false)
  }

  async function resend() {
    if (!sentTo) return
    setError('')
    setInfo('')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: sentTo,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setInfo('Sent again. Check your spam folder too.')
  }

  const brand = (
    <div className={s.brand}>
      <Crown className={s.crown} />
      <div>
        <div className={s.brandName}>Triple Crown</div>
        <div className={s.brandSub}>Football Pick&apos;em</div>
      </div>
    </div>
  )

  if (sentTo) {
    return (
      <main className={s.page}>
        <div className={s.card}>
          {brand}
          <h1 className={s.title}>Check your email</h1>
          <p className={s.subtitle}>
            We sent a confirmation link to <strong>{sentTo}</strong>. Open it on any device, then
            come back here and you&apos;ll be signed in. You can leave this tab open.
          </p>
          {error && <div className={s.error}>{error}</div>}
          {info && <div className={s.notice}>{info}</div>}
          <button className={s.primary} disabled={checkingConfirm} onClick={() => tryConfirmedLogin(true)}>
            {checkingConfirm ? 'Checking...' : "I've confirmed my email"}
          </button>
          <button className={s.secondary} onClick={resend}>Resend email</button>
          <div className={s.switch}>
            <button className={s.link} onClick={() => { setSentTo(null); setMode('login') }}>
              Back to log in
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        {brand}
        <h1 className={s.title}>{mode === 'login' ? 'Welcome back' : 'Join the league'}</h1>
        <p className={s.subtitle}>
          {mode === 'login' ? 'Log in to make your picks.' : 'Create an account to start picking.'}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className={s.field}>
              <label className={s.label} htmlFor="username">Username</label>
              <input id="username" className={s.input} placeholder="What your friends will see"
                value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
          )}
          <div className={s.field}>
            <label className={s.label} htmlFor="email">Email</label>
            <input id="email" className={s.input} type="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="password">Password</label>
            <div className={s.inputWrap}>
              <input id="password" className={`${s.input} ${s.inputPad}`}
                type={showPw ? 'text' : 'password'} placeholder="At least 6 characters"
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              <button type="button" className={s.toggle} onClick={() => setShowPw(!showPw)}>
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && <div className={s.error}>{error}</div>}

          <button type="submit" className={s.primary} disabled={busy}>
            {busy ? 'Working...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <div className={s.switch}>
          {mode === 'login' ? 'New here? ' : 'Already have an account? '}
          <button className={s.link}
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </main>
  )
}