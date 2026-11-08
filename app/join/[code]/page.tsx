'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { rememberNext, clearNext } from '../../../lib/redirect'
import Crown from '../../Crown'
import s from '../../styles'

type Preview = { id: string; name: string; member_count: number }

function JoinView() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [league, setLeague] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        rememberNext(`/join/${code}`)
        router.replace('/login')
        return
      }
      clearNext()
      const { data } = await supabase.rpc('league_preview', { p_code: code })
      const row = (Array.isArray(data) ? data[0] : data) as Preview | undefined
      if (!row) setState('invalid')
      else { setLeague(row); setState('ready') }
    }
    init()
  }, [code, router])

  async function join() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('join_league_by_code', { p_code: code })
    setBusy(false)
    if (error) setError(error.message)
    else router.push(`/leagues/${data}`)
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className={s.brand}><Crown className={s.crown} /></div>
        {state === 'loading' && <p className={s.subtitle}>Loading...</p>}
        {state === 'invalid' && (
          <>
            <h1 className={s.title}>Invalid link</h1>
            <p className={s.subtitle}>This invite link doesn&apos;t match any league. Ask for a new one.</p>
            <Link href="/leagues" className={s.link}>Go to my leagues</Link>
          </>
        )}
        {state === 'ready' && league && (
          <>
            <p className={s.brandSub}>You&apos;re invited to join</p>
            <h1 className={s.title} style={{ marginTop: 8 }}>{league.name}</h1>
            <p className={s.subtitle}>{league.member_count} {league.member_count === 1 ? 'player' : 'players'} so far</p>
            {error && <div className={s.error}>{error}</div>}
            <button className={s.primary} onClick={join} disabled={busy}>
              {busy ? 'Joining...' : 'Join league'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinView />
    </Suspense>
  )
}