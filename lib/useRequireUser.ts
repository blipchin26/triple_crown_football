'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'

export function useRequireUser() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    // getSession() reads the saved session from this browser (no network round trip). The database still enforces
    // who can see what, so this check is only about sending signed-out visitors to the login page.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (!session) router.replace('/login')
      else setUserId(session.user.id)
    })

    // signed out in another tab, or the session expired
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })

    return () => {
      active = false
      sub?.subscription?.unsubscribe()
    }
  }, [router])

  return userId
}