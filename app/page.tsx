'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import Crown from './Crown'
import s from './styles'

export default function Home() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/leagues')
      else setChecking(false)
    })
  }, [router])

  if (checking) return <main className={s.page} />

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.brand}>
          <Crown className={s.crown} />
          <div>
            <div className={s.brandName}>Triple Crown</div>
            <div className={s.brandSub}>Football Pick&apos;em · 2026</div>
          </div>
        </div>
        <h1 className={s.title}>Pick the games. Win the crowns.</h1>
        <p className={s.subtitle}>Weekly picks with a prize for the best record, the most weekly wins, and the boldest upset calls.</p>
        <Link href="/login"><button className={s.primary}>Log in or sign up</button></Link>
      </div>
    </main>
  )
}