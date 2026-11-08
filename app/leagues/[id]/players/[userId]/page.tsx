'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../../lib/supabase'
import { useRequireUser } from '../../../../../lib/useRequireUser'
import Crown from '../../../../Crown'
import Avatar from '../../../../Avatar'
import RaceForTripleCrown from '../../RaceForTripleCrown'
import s from '../../../../styles'

type Player = {
  role: string
  joined_at: string
  profiles: { username: string; avatar_config: Record<string, unknown> | null } | null
}

function PlayerView() {
  const { id, userId: playerId } = useParams<{ id: string; userId: string }>()
  const me = useRequireUser()
  const [leagueName, setLeagueName] = useState('')
  const [player, setPlayer] = useState<Player | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!me) return
    async function load() {
      const [l, m] = await Promise.all([
        supabase.from('leagues').select('name').eq('id', id).maybeSingle(),
        supabase.from('league_members')
          .select('role, joined_at, profiles(username, avatar_config)')
          .eq('league_id', id).eq('user_id', playerId).maybeSingle(),
      ])
      if (!l.data || !m.data) { setState('missing'); return }
      setLeagueName(l.data.name)
      setPlayer(m.data as unknown as Player)
      setState('ready')
    }
    load()
  }, [me, id, playerId])

  const isSelf = me === playerId

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.left}>
          <Link href={`/leagues/${id}?tab=players`} className={s.back}>
            ← {leagueName ? `${leagueName} players` : 'Players'}
          </Link>
        </div>

        {state === 'loading' && <p className={s.subtitle}>Loading...</p>}
        {state === 'missing' && (
          <>
            <h1 className={s.title}>Player not found</h1>
            <p className={s.subtitle}>They may not be in this league.</p>
          </>
        )}
        {state === 'ready' && player && (
          <>
            <div className={s.profileHead}>
              <Avatar config={player.profiles?.avatar_config} size={76} />
              <h1 className={s.profileName}>
                {player.profiles?.username ?? 'Unknown'}
                {player.role === 'owner' && <Crown className={s.crownSm} />}
              </h1>
              <div className={s.profileMeta}>
                {isSelf ? 'This is you' : 'League player'}
                {player.role !== 'member' && ' · Admin'}
                {' · Joined '}
                {new Date(player.joined_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              {!isSelf && <p className={s.hint} style={{ textAlign: 'center' }}>Their picks appear once each game has kicked off.</p>}
            </div>

            <RaceForTripleCrown
              leagueId={id}
              viewUserId={playerId}
              weekHref={isSelf ? (w) => `/leagues/${id}/weeks/${w}` : undefined}
            />
          </>
        )}
      </div>
    </main>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={null}>
      <PlayerView />
    </Suspense>
  )
}
