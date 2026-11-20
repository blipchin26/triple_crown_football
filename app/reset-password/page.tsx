'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import Crown from '../Crown'
import s from '../styles'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      setError(error.message)
      setBusy(false)
    } else {
      setInfo('Password updated successfully.')
      setBusy(false)
      router.push('/login')
    }
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className={s.brand}>
          <Crown className={s.crown} />
          <div>
            <div className={s.brandName}>Triple Crown</div>
            <div className={s.brandSub}>Football Pick&apos;em</div>
          </div>
        </div>

        <h1 className={s.title}>Reset your password</h1>
        <p className={s.subtitle}>Enter your new password below.</p>

        <form onSubmit={handleSubmit}>
          <div className={s.field}>
            <label className={s.label} htmlFor="password">
              New password
            </label>
            <input
              id="password"
              className={s.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="confirmPassword">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              className={s.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Re-enter your password"
            />
          </div>

          {error && <div className={s.error}>{error}</div>}
          {info && <div className={s.notice}>{info}</div>}

          <button type="submit" className={s.primary} disabled={busy}>
            {busy ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </main>
  )
}