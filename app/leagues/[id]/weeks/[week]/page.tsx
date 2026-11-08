'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../../lib/supabase'
import { useRequireUser } from '../../../../../lib/useRequireUser'
import { upsetPoints } from '../../../../../lib/scoring'
import Tabs from '../../../../Tabs'
import s from '../../../../styles'

type Side = 'away' | 'home'
type Game = {
  id: number
  kickoff_at: string
  away_team: string
  home_team: string
  away_win_prob: number | null
  home_win_prob: number | null
}
type MyLeague = { id: string; name: string }

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function WeekView() {
  const { id, week } = useParams<{ id: string; week: string }>()
  const router = useRouter()
  const userId = useRequireUser()
  const [leagues, setLeagues] = useState<MyLeague[]>([])
  const [shared, setShared] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [picks, setPicks] = useState<Record<number, Side>>({})
  const [initialized, setInitialized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [notMember, setNotMember] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  // keep lock status fresh without a page refresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError('')

    const [prof, mem, season] = await Promise.all([
      supabase.from('profiles').select('share_picks').eq('id', userId).single(),
      supabase.from('league_members').select('leagues(id, name)').eq('user_id', userId),
      supabase.from('seasons').select('id').eq('is_active', true).maybeSingle(),
    ])

    const sharedNow = prof.data?.share_picks ?? false
    const myLeagues = ((mem.data ?? []) as unknown as { leagues: MyLeague | null }[])
      .map((r) => r.leagues)
      .filter((l): l is MyLeague => !!l)
    setShared(sharedNow)
    setLeagues(myLeagues)
    setNotMember(!myLeagues.some((l) => l.id === id))

    let list: Game[] = []
    if (season.data) {
      const { data } = await supabase
        .from('games')
        .select('id, kickoff_at, away_team, home_team, away_win_prob, home_win_prob')
        .eq('season_id', season.data.id)
        .eq('week', Number(week))
        .order('kickoff_at')
        .order('sort_key')
      list = ((data ?? []) as Game[]).map((g) => ({
        ...g,
        away_win_prob: g.away_win_prob == null ? null : Number(g.away_win_prob),
        home_win_prob: g.home_win_prob == null ? null : Number(g.home_win_prob),
      }))
    }
    setGames(list)

    const map: Record<number, Side> = {}
    if (list.length > 0) {
      let q = supabase
        .from('picks').select('game_id, picked')
        .eq('user_id', userId)
        .in('game_id', list.map((g) => g.id))
      q = sharedNow ? q.is('league_id', null) : q.eq('league_id', id)
      const { data } = await q
      for (const p of (data ?? []) as { game_id: number; picked: Side }[]) map[p.game_id] = p.picked
    }
    setPicks(map)

    setLoading(false)
    setInitialized(true)
    setSwitching(false)
  }, [userId, id, week])

  useEffect(() => { load() }, [load])

  function onSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === id) return
    setSwitching(true)
    setTimeout(() => router.push(`/leagues/${next}/weeks/${week}`), 500)
  }

  async function pick(g: Game, side: Side) {
    setError('')
    const { error } = await supabase.rpc('save_pick', {
      p_game: g.id,
      p_league: shared ? null : id,
      p_picked: side,
    })
    if (error) setError(error.message)
    else setPicks({ ...picks, [g.id]: side })
  }

  const currentLeague = leagues.find((l) => l.id === id)
  const pickedCount = games.filter((g) => picks[g.id]).length

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <Tabs active="leagues" />
        <div className={s.left}><Link href={`/leagues/${id}`} className={s.back}>← Back to league</Link></div>

        {!initialized ? (
          <p className={s.subtitle}>Loading...</p>
        ) : notMember ? (
          <>
            <h1 className={s.title}>League not found</h1>
            <p className={s.subtitle}>You may not be a member of this league.</p>
          </>
        ) : (
          <>
            <div className={s.pickHeader}>
              <span
                className={s.selectWrap}
                title={shared
                  ? 'Your picks are shared across all leagues, so this can’t be changed. Turn off “Make my picks consistent across all leagues” in Settings to pick separately for each league.'
                  : undefined}
              >
                <select className={s.select} value={shared ? 'all' : id}
                  disabled={shared || switching} onChange={onSwitch}>
                  {shared ? (
                    <option value="all">ALL</option>
                  ) : (
                    leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)
                  )}
                </select>
              </span>
              {switching && (
                <span className={s.switching}>
                  <span className={s.spinner} /> Changing leagues...
                </span>
              )}
            </div>

            <h1 className={s.title}>Week {week}</h1>
            <p className={s.subtitle} style={{ marginBottom: 16 }}>
              {shared ? 'Your picks apply to all of your leagues.' : currentLeague?.name}
            </p>

            {error && <div className={s.error}>{error}</div>}

            {loading ? null : games.length === 0 ? (
              <p className={s.hint}>No games for this week yet.</p>
            ) : (
              <>
                <p className={s.progress}>
                  {pickedCount} of {games.length} picked. Unpicked games count as a loss.
                </p>
                <div className={s.list}>
                  {games.map((g) => {
                    const locked = now >= new Date(g.kickoff_at).getTime()
                    return (
                      <div key={g.id} className={s.game}>
                        <div className={s.gameTime}>
                          <span>{fmt(g.kickoff_at)}</span>
                          {locked && <span className={s.lockTag}>Locked</span>}
                        </div>
                        <div className={s.sides}>
                          {(['away', 'home'] as const).map((side) => {
                            const team = side === 'away' ? g.away_team : g.home_team
                            const p = side === 'away' ? g.away_win_prob : g.home_win_prob
                            const chosen = picks[g.id] === side
                            return (
                              <button key={side} disabled={locked}
                                className={`${s.side} ${chosen ? s.sideOn : ''}`}
                                onClick={() => pick(g, side)}>
                                <span className={s.sideTag}>{side === 'away' ? 'Away' : 'Home'}</span>
                                <span className={s.sideTeam}>{team}</span>
                                <span className={s.sideMeta}>
                                  {p != null
                                  ? `${Math.round(p * 100)}% · +${Math.round(
                                      10 * Math.pow(Math.max(p > 1 ? p / 100 : p, 0.01), -0.9)
                                    )} pts`
                                  : 'Odds pending'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {locked && !picks[g.id] && (
                          <p className={s.hint}>No pick made. This game counts as a loss.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default function WeekPage() {
  return (
    <Suspense fallback={null}>
      <WeekView />
    </Suspense>
  )
}