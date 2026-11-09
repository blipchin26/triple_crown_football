'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import Crown from './Crown'
import UserMenu from './UserMenu'
import PrefsApplier from './PrefsApplier'
import s from './styles'

// Slim bar at the top of every signed-in page: brand on the left, your name/avatar menu on the right.
// Hidden while signed out and on the login screens.
function HeaderInner() {
  const pathname = usePathname()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!userId || pathname === '/login' || pathname?.startsWith('/auth')) return null

  return (
    <>
      <header className={s.appbar}>
        <div className={s.appbarInner}>
          <Link href="/leagues" className={s.appbarBrand}>
            <Crown className={s.appbarCrown} />
            <span>Triple Crown</span>
          </Link>
          <UserMenu />
        </div>
      </header>
      <PrefsApplier userId={userId} />
    </>
  )
}

// usePathname() on dynamic routes (like /join/[code]) must sit inside a Suspense boundary to build.
export default function AppHeader() {
  return (
    <Suspense fallback={null}>
      <HeaderInner />
    </Suspense>
  )
}