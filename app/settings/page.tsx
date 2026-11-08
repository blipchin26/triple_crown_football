'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useRequireUser } from '../../lib/useRequireUser'
import Crown from '../Crown'
import Tabs from '../Tabs'
import s from '../styles'

export default function SettingsPage() {
  const router = useRouter()
  const userId = useRequireUser()
  const [shared, setShared] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('share_picks').eq('id', userId).single()
      .then(({ data }) => setShared(data?.share_picks ?? false))
  }, [userId])

  async function toggle(value: boolean) {
    if (!userId) return
    setError('')
    const { error } = await supabase.from('profiles').update({ share_picks: value }).eq('id', userId)
    if (error) setError(error.message)
    else setShared(value)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <Tabs active="settings" />
        <div className={s.brand}>
          <Crown className={s.crown} />
          <div className={s.brandName}>Settings</div>
        </div>

        {error && <div className={s.error}>{error}</div>}

        {shared === null ? (
          <p className={s.subtitle}>Loading...</p>
        ) : (
          <>
            <div className={s.sectionTitle}>Picks</div>
            <label className={s.check}>
              <input type="checkbox" checked={shared} onChange={(e) => toggle(e.target.checked)} />
              <div>
                <div className={s.checkTitle}>Make my picks consistent across all leagues</div>
                <div className={s.checkSub}>
                  On: you make one set of picks and every league uses it. Off: you make separate picks
                  in each league. You can switch any time and nothing is deleted. For each game, the
                  setting that was on at kickoff decides which picks count.
                </div>
              </div>
            </label>

            <div className={s.sectionTitle}>Account</div>
            <button className={s.secondary} onClick={logout}>Log out</button>
          </>
        )}
      </div>
    </main>
  )
}