
'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../../lib/supabase'
import { useRequireUser } from '../../../../../lib/useRequireUser'
import BetPanel, { useBetting } from '../../BetPanel'
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

type MyLeague = {
  id: string
  name: string
  season_id: number | null
  start_week: number | null
  crown_config: string[] | null
}

type SurvivalHistory = {
  week: number
  selected_team: string | null
  eliminated_team: string | null
  result: 'pending' | 'correct' | 'incorrect' | 'missed'
  points: number | null
  kickoff: string | null
  locked_at: string | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
  const [survivalHistory, setSurvivalHistory] = useState<SurvivalHistory[]>([])
  const [showSurvivalPicker, setShowSurvivalPicker] = useState(false)
  const [survivalSaving, setSurvivalSaving] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const [saveState, setSaveState] = useState<Record<number, 'saving' | 'saved'>>({})
  const saveTimers = useRef<Record<number, number>>({})
  const betting = useBetting(games.map((g) => g.id))

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError('')

    const [prof, mem] = await Promise.all([
      supabase.from('profiles').select('share_picks').eq('id', userId).single(),
      supabase.from('league_members')
        .select('leagues(id, name, season_id, start_week, crown_config)')
        .eq('user_id', userId),
    ])

    const sharedNow = prof.data?.share_picks ?? false
    const myLeagues = ((mem.data ?? []) as unknown as { leagues: MyLeague | null }[])
      .map((r) => r.leagues)
      .filter((l): l is MyLeague => !!l)

    setShared(sharedNow)
    setLeagues(myLeagues)
    setNotMember(!myLeagues.some((l) => l.id === id))

    const selectedLeague = myLeagues.find((l) => l.id === id)

    let survivalList: SurvivalHistory[] = []

    if (selectedLeague?.crown_config?.includes('survival')) {
      const { data, error: survivalLoadError } = await supabase.rpc(
        'league_survival_history',
        { p_league: id, p_user: null }
      )

      if (survivalLoadError) {
        setError(survivalLoadError.message)
      } else {
        survivalList = (data ?? []) as SurvivalHistory[]
      }
    }

    setSurvivalHistory(survivalList)

    let list: Game[] = []

    if (selectedLeague?.season_id != null) {
      const { data } = await supabase
        .from('games')
        .select('id, kickoff_at, away_team, home_team, away_win_prob, home_win_prob')
        .eq('season_id', selectedLeague.season_id)
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
        .from('picks')
        .select('game_id, picked')
        .eq('user_id', userId)
        .in('game_id', list.map((g) => g.id))

      q = sharedNow ? q.is('league_id', null) : q.eq('league_id', id)

      const { data } = await q

      for (const p of (data ?? []) as { game_id: number; picked: Side }[]) {
        map[p.game_id] = p.picked
      }
    }

    setPicks(map)
    setLoading(false)
    setInitialized(true)
    setSwitching(false)
  }, [userId, id, week])

  useEffect(() => {
    load()
  }, [load])

  function onSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === id) return

    setSwitching(true)
    setTimeout(() => router.push(`/leagues/${next}/weeks/${week}`), 500)
  }

  function clearSave(gameId: number) {
    setSaveState((prev) => {
      const next = { ...prev }
      delete next[gameId]
      return next
    })
  }

  async function pick(g: Game, side: Side) {
    setError('')
    window.clearTimeout(saveTimers.current[g.id])
    setSaveState((prev) => ({ ...prev, [g.id]: 'saving' }))

    const started = Date.now()

    const { error } = await supabase.rpc('save_pick', {
      p_game: g.id,
      p_league: shared ? null : id,
      p_picked: side,
    })

    if (error) {
      setError(error.message)
      clearSave(g.id)
      return
    }

    setPicks((prev) => ({ ...prev, [g.id]: side }))

    await new Promise((r) =>
      setTimeout(r, Math.max(0, 400 - (Date.now() - started)))
    )

    setSaveState((prev) => ({ ...prev, [g.id]: 'saved' }))
    saveTimers.current[g.id] = window.setTimeout(() => clearSave(g.id), 2000)
  }

  const currentLeague = leagues.find((l) => l.id === id)

  const beforeLeagueStart =
    currentLeague?.start_week != null &&
    Number(week) < currentLeague.start_week

  const pickedCount = games.filter((g) => picks[g.id]).length

  const survivalEnabled =
    currentLeague?.crown_config?.includes('survival') ?? false

  const survivalWeek = Number(week)

  const mySurvivalPick = survivalHistory.find(
    (r) => r.week === survivalWeek
  )

  const selectedSurvivalTeam = mySurvivalPick?.selected_team ?? null

  const survivalLocked =
    !!mySurvivalPick?.locked_at ||
    (!!mySurvivalPick?.kickoff &&
      now >= new Date(mySurvivalPick.kickoff).getTime())

  async function refreshSurvival() {
    const { data, error } = await supabase.rpc('league_survival_history', {
      p_league: id,
      p_user: null,
    })

    if (error) {
      setError(error.message)
      return false
    }

    setSurvivalHistory((data ?? []) as SurvivalHistory[])
    return true
  }

  async function saveSurvivalTeam(team: string) {
    if (survivalSaving || survivalLocked) return

    setError('')
    setSurvivalSaving(true)

    const { error } = await supabase.rpc('select_survival_team', {
      p_league: id,
      p_week: survivalWeek,
      p_team: team,
    })

    if (error) {
      setError(error.message)
    } else {
      await refreshSurvival()
      setShowSurvivalPicker(false)
    }

    setSurvivalSaving(false)
  }

  async function clearSurvivalPick() {
    if (survivalSaving || survivalLocked || !selectedSurvivalTeam) return

    setError('')
    setSurvivalSaving(true)

    const { error } = await supabase.rpc('clear_survival_team', {
      p_league: id,
      p_week: survivalWeek,
    })

    if (error) {
      setError(error.message)
    } else {
      await refreshSurvival()
    }

    setSurvivalSaving(false)
  }

  async function handleTeamClick(g: Game, side: Side) {
    if (showSurvivalPicker) {
      const team = side === 'away' ? g.away_team : g.home_team
      await saveSurvivalTeam(team)
    } else {
      await pick(g, side)
    }
  }

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.left}>
          <Link href={`/leagues/${id}`} className={s.back}>
            ← Back to league
          </Link>
        </div>

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
                <select
                  className={s.select}
                  value={shared ? 'all' : id}
                  disabled={shared || switching}
                  onChange={onSwitch}
                >
                  {shared ? (
                    <option value="all">ALL</option>
                  ) : (
                    leagues.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))
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
                {beforeLeagueStart ? (
                  <p className={s.hint}>
                    This league's competition starts in Week {currentLeague?.start_week}.
                    Earlier picks are visible for reference but cannot be changed or counted
                    toward this league.
                  </p>
                ) : (
                  <p className={s.progress}>
                    {pickedCount} of {games.length} picked. Unpicked games count as a loss.
                  </p>
                )}

                {survivalEnabled && !beforeLeagueStart && (
                  <div style={{
                    maxWidth: 520,
                    width: '100%',
                    margin: '0 auto 16px',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid rgba(220, 38, 38, 0.35)',
                    background: showSurvivalPicker
                      ? 'rgba(220, 38, 38, 0.07)'
                      : 'transparent',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}>
                      <div>
                        <strong>Survival Pick</strong>
                        <p className={s.hint} style={{ margin: '4px 0 0' }}>
                          {survivalLocked
                            ? `${selectedSurvivalTeam ?? 'Selection'} is locked for this week.`
                            : selectedSurvivalTeam
                              ? `Current selection: ${selectedSurvivalTeam}`
                              : 'Choose one team from this week’s games.'}
                        </p>
                      </div>

                      {!survivalLocked && (
                        <div style={{
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}>
                          <button
                            type="button"
                            className={s.side}
                            disabled={survivalSaving}
                            onClick={() => setShowSurvivalPicker((v) => !v)}
                          >
                            {showSurvivalPicker
                              ? 'Cancel'
                              : selectedSurvivalTeam
                                ? 'Change Survival Pick'
                                : 'Make Survival Pick'}
                          </button>

                          {selectedSurvivalTeam && (
                            <button
                              type="button"
                              className={s.side}
                              disabled={survivalSaving}
                              onClick={clearSurvivalPick}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {showSurvivalPicker && (
                      <p className={s.hint} style={{ marginBottom: 0, marginTop: 10 }}>
                        Select a team using its game button below. Your regular picks will
                        not be changed.
                      </p>
                    )}

                    {mySurvivalPick && mySurvivalPick.result !== 'pending' && (
                      <p className={s.hint} style={{ marginBottom: 0, marginTop: 8 }}>
                        Result: {mySurvivalPick.result} · {mySurvivalPick.points ?? 0} points
                      </p>
                    )}
                  </div>
                )}

                <div className={`${s.list} ${showSurvivalPicker ? 'survivalPicking' : ''}`}>
                  {games.map((g) => {
                    const locked =
                      beforeLeagueStart ||
                      now >= new Date(g.kickoff_at).getTime()

                    return (
                      <div key={g.id} className={s.game}>
                        <div className={s.gameTime}>
                          <span>{fmt(g.kickoff_at)}</span>

                          {saveState[g.id] === 'saving' && (
                            <span className={s.saveTag} role="status">
                              <span className={s.saveSpin} /> Saving
                            </span>
                          )}

                          {saveState[g.id] === 'saved' && (
                            <span className={s.saveTag} role="status">
                              <span className={s.saveCheck}>✓</span> Saved
                            </span>
                          )}

                          {locked && <span className={s.lockTag}>Locked</span>}
                        </div>

                        <div className={s.sides}>
                          {(['away', 'home'] as const).map((side) => {
                            const team = side === 'away' ? g.away_team : g.home_team
                            const p = side === 'away' ? g.away_win_prob : g.home_win_prob
                            const chosen = picks[g.id] === side
                            const isSurvivalTeam = selectedSurvivalTeam === team

                            const used = survivalHistory.find(
                              (r) =>
                                r.week !== survivalWeek &&
                                (r.selected_team === team ||
                                  r.eliminated_team === team)
                            )

                            const unavailableForSurvival =
                              !!used && !isSurvivalTeam

                            const disabled =
                              locked ||
                              (showSurvivalPicker &&
                                (survivalSaving || unavailableForSurvival))

                            return (
                              <button
                                key={side}
                                disabled={disabled}
                                className={`${s.side} ${chosen ? s.sideOn : ''}`}
                                onClick={() => handleTeamClick(g, side)}
                                style={{
                                  position: 'relative',
                                  ...(showSurvivalPicker && unavailableForSurvival
                                    ? { opacity: 0.45 }
                                    : {}),
                                  ...(showSurvivalPicker
                                    ? {
                                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                                      }
                                    : {}),
                                }}
                              >
                                <span className={s.sideTag}>
                                  {side === 'away' ? 'Away' : 'Home'}
                                </span>

                                <span className={s.sideTeam}>{team}</span>

                                {isSurvivalTeam && (
                                  <span style={{
                                    display: 'inline-block',
                                    marginTop: 5,
                                    padding: '3px 8px',
                                    borderRadius: 5,
                                    background: '#dc2626',
                                    color: '#fff',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    letterSpacing: '0.06em',
                                  }}>
                                    SURVIVAL PICK
                                  </span>
                                )}

                                {showSurvivalPicker && used && !isSurvivalTeam && (
                                  <span style={{
                                    display: 'block',
                                    marginTop: 5,
                                    color: '#dc2626',
                                    fontSize: 11,
                                    fontWeight: 600,
                                  }}>
                                    {used.selected_team === team
                                      ? `Selected for Week ${used.week}`
                                      : `Eliminated in Week ${used.week}`}
                                  </span>
                                )}

                                <span className={s.sideMeta}>
                                  {p != null
                                    ? `${Math.round(p * 100)}% · +${Math.round(
                                        10 * Math.pow(
                                          Math.max(p > 1 ? p / 100 : p, 0.01),
                                          -0.9
                                        )
                                      )} pts`
                                    : 'Odds pending'}
                                </span>
                              </button>
                            )
                          })}
                        </div>

                        <BetPanel game={g} betting={betting} />

                        {locked && !picks[g.id] && (
                          <p className={s.hint}>
                            No pick made. This game counts as a loss.
                          </p>
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
