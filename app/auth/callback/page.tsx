'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { goAfterAuth } from '../../../lib/redirect'
import Crown from '../../Crown'
import s from '../../styles'

export default function AuthCallback() {
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function finish() {
      // Supabase finishes signing in from the email link while this call resolves
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) goAfterAuth(router)
      else setFailed(true)
    }
    finish()
    return () => { cancelled = true }
  }, [router])

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.center}`}>
        <div className={s.brand} style={{ justifyContent: 'center' }}>
          <Crown className={s.crown} />
        </div>
        {failed ? (
          <>
            <h1 className={s.title}>Email confirmed</h1>
            <p className={s.subtitle}>
              Your account is ready, but we couldn&apos;t sign you in automatically
              (this happens if you opened the link on a different device or browser).
            </p>
            <Link href="/login" className={s.link}>Go to log in</Link>
          </>
        ) : (
          <>
            <h1 className={s.title}>Signing you in...</h1>
            <p className={s.subtitle}>One moment.</p>
          </>
        )}
      </div>
    </main>
  )
}