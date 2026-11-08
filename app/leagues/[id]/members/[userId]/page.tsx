'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../../lib/supabase'
import { useRequireUser } from '../../../../../lib/useRequireUser'
import Crown from '../../../../Crown'
import RaceForTripleCrown from '../../RaceForTripleCrown'
import Tabs from '../../../../Tabs'
import s from '../../../../styles'

function MemberView() {
  const { id, userId: target } = useParams<{ id: string; userId: string }>()
  const me = useRequireUser()
  const [username, setUsername] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!me) return
    async function load() {
      const { data: member } = await supabase
        .from('league_members').select('user_id')
        .eq('league_id', id).eq('user_id', target).maybeSingle()
      if (!member) { setNotFound(true); return }
      const { data: p } = await supabase.from('profiles').select('username').eq('id', target).maybeSingle()
      setUsername(p?.username ?? 'Player')
    }
    load()
  }, [me, id, target])

  const isMe = me === target

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <Tabs active="leagues" />
        <div className={s.left}><Link href={`/leagues/${id}`} className={s.back}>← Back to league</Link></div>

        {notFound ? (
          <>
            <h1 className={s.title}>Player not found</h1>
            <p className={s.subtitle}>They may not be in this league.</p>
          </>
        ) : !username ? (
          <p className={s.subtitle}>Loading...</p>
        ) : (
          <>
            <div className={s.brand}>
              <Crown className={s.crown} />
              <h1 className={s.title} style={{ margin: 0 }}>{username}{isMe ? ' (you)' : ''}</h1>
              {!isMe && (
                <div className={s.brandSub}>You can see their picks once each game has kicked off.</div>
              )}
            </div>
            <RaceForTripleCrown leagueId={id} viewUserId={target} />
          </>
        )}
      </div>
    </main>
  )
}

export default function MemberPage() {
  return (
    <Suspense fallback={null}>
      <MemberView />
    </Suspense>
  )
}
