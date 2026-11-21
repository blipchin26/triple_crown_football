'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../../lib/supabase'
import { useRequireUser } from '../../../../../lib/useRequireUser'
import BetPanel, { useBetting } from '../../BetPanel'
import InfoTip from '../../../../InfoTip'
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

type ConfRow = {
  game_id: number
  kickoff_at: string
  value: number
  explicit: boolean
  locked: boolean
  is_final: boolean
  correct: boolean
  points: number
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

function StatusPill({ ok, okText, todoText }: { ok: boolean; okText: string; todoText: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      color: ok ? '#15803d' : '#b45309',
      background: ok ? 'rgba(21, 128, 61, 0.10)' : 'rgba(217, 119, 6, 0.14)',
      border: `1px solid ${ok ? 'rgba(21, 128, 61, 0.35)' : 'rgba(217, 119, 6, 0.45)'}`,
    }}>
      {ok ? '✓' : '!'} {ok ? okText : todoText}
    </span>
  )
}

function WeekView() {
  const { id, week } = useParams<{ id: string; week: string }>()
  const router = useRouter()
  const userId = useRequireUser()

  const [leagues, setLeagues] = useState<MyLeague[]>([])
  const [shared, setShared] = useState(false)
  const [shareConf, setShareConf] = useState(false)
  const [shareSurv, setShareSurv] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [picks, setPicks] = useState<Record<number, Side>>({})
  const [initialized, setInitialized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [notMember, setNotMember] = useState(false)
  const [survivalHistory, setSurvivalHistory] = useState<SurvivalHistory[]>([])
  const [conf, setConf] = useState<Record<number, ConfRow>>({})
  const [confSaving, setConfSaving] = useState(false)
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
      supabase.from('profiles').select('share_picks, share_confidence, share_survival').eq('id', userId).single(),
      supabase.from('league_members')
        .select('leagues(id, name, season_id, start_week, crown_config)')
        .eq('user_id', userId),
    ])

    const sharedNow = prof.data?.share_picks ?? false
    const myLeagues = ((mem.data ?? []) as unknown as { leagues: MyLeague | null }[])
      .map((r) => r.leagues)
      .filter((l): l is MyLeague => !!l)

    setShared(sharedNow)
    setShareConf(sharedNow && !!prof.data?.share_confidence)
    setShareSurv(sharedNow && !!prof.data?.share_survival)
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

    const confMap: Record<number, ConfRow> = {}

    if (selectedLeague?.crown_config?.includes('confidence_points')) {
      const { data, error: confLoadError } = await supabase.rpc('league_confidence_week', {
        p_league: id,
        p_week: Number(week),
      })

      if (confLoadError) {
        setError(confLoadError.message)
      } else {
        for (const r of (data ?? []) as ConfRow[]) confMap[r.game_id] = r
      }
    }

    setConf(confMap)

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

    const { error } = await supabase.rpc('select_survival_team_everywhere', {
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

    const { error } = await supabase.rpc('clear_survival_team_everywhere', {
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

  const confidenceEnabled =
    currentLeague?.crown_config?.includes('confidence_points') ?? false

  const isOpen = (g: Game) => now < new Date(g.kickoff_at).getTime()

  // A number is "taken" if an open game has it set, or a locked game holds it (even automatically).
  const holderOf = (v: number, exceptId: number) =>
    games.find((x) => x.id !== exceptId && conf[x.id] && conf[x.id].value === v && (!isOpen(x) || conf[x.id].explicit))

  const confOpenGames = games.filter(isOpen)
  const confMissing = confOpenGames.filter((g) => !conf[g.id]?.explicit).length
  const allKicked = games.length > 0 && confOpenGames.length === 0

  const confEarned = games.reduce((sum, g) => sum + (conf[g.id]?.points ?? 0), 0)
  const confPossible = (games.length * (games.length + 1)) / 2

  async function saveConfidence(next: Record<number, ConfRow>, tagGame: number | null) {
    const payload: Record<string, number | null> = {}
    for (const x of games) {
      if (isOpen(x) && next[x.id]) {
        payload[String(x.id)] = next[x.id].explicit ? next[x.id].value : null
      }
    }

    setError('')
    setConf(next)
    setConfSaving(true)

    const started = Date.now()

    const { error: saveError } = await supabase.rpc('save_confidence_everywhere', {
      p_league: id,
      p_week: Number(week),
      p_values: payload,
    })

    if (saveError) {
      setError(saveError.message)
      await load()
    } else if (tagGame != null) {
      setSaveState((prev) => ({ ...prev, [tagGame]: 'saving' }))
      await new Promise((r) => setTimeout(r, Math.max(0, 400 - (Date.now() - started))))
      setSaveState((prev) => ({ ...prev, [tagGame]: 'saved' }))
      window.clearTimeout(saveTimers.current[tagGame])
      saveTimers.current[tagGame] = window.setTimeout(() => clearSave(tagGame), 2000)
    }

    setConfSaving(false)
  }

  // value === null clears the game. Choosing a number another open game already has moves it here
  // and leaves that game blank.
  async function changeConfidence(g: Game, value: number | null) {
    const cur = conf[g.id]
    if (!cur || confSaving) return
    if (value === null ? !cur.explicit : cur.explicit && cur.value === value) return

    const next: Record<number, ConfRow> = { ...conf }
    if (value === null) {
      next[g.id] = { ...cur, explicit: false }
    } else {
      const holder = holderOf(value, g.id)
      if (holder) next[holder.id] = { ...conf[holder.id], explicit: false }
      next[g.id] = { ...cur, value, explicit: true }
    }

    await saveConfidence(next, g.id)
  }

  // Give every blank open game the lowest numbers that are still free, in kickoff order.
  async function autofillConfidence() {
    if (confSaving || confMissing === 0) return

    const taken = new Set<number>()
    for (const x of games) {
      if (conf[x.id] && (!isOpen(x) || conf[x.id].explicit)) taken.add(conf[x.id].value)
    }

    const free: number[] = []
    for (let v = 1; v <= games.length; v++) if (!taken.has(v)) free.push(v)

    const next: Record<number, ConfRow> = { ...conf }
    let i = 0
    for (const x of confOpenGames) {
      if (!conf[x.id]?.explicit && i < free.length) {
        next[x.id] = { ...conf[x.id], value: free[i++], explicit: true }
      }
    }

    await saveConfidence(next, null)
  }

  // Blank every open game again (locked games keep their numbers).
  async function clearAllConfidence() {
    if (confSaving || !confOpenGames.some((g) => conf[g.id]?.explicit)) return

    const next: Record<number, ConfRow> = { ...conf }
    for (const x of confOpenGames) {
      if (next[x.id]?.explicit) next[x.id] = { ...next[x.id], explicit: false }
    }

    await saveConfidence(next, null)
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
                {beforeLeagueStart && (
                  <p className={s.hint}>
                    This league's competition starts in Week {currentLeague?.start_week}.
                    Earlier picks are visible for reference but cannot be changed or counted
                    toward this league.
                  </p>
                )}

                {(survivalEnabled || confidenceEnabled) && !beforeLeagueStart && (
                  <div style={{
                    maxWidth: 520,
                    width: '100%',
                    margin: '0 auto 12px',
                    border: '1px solid rgba(128, 128, 128, 0.3)',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}>
                    {survivalEnabled && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        padding: '8px 12px',
                        background: showSurvivalPicker ? 'rgba(220, 38, 38, 0.07)' : 'transparent',
                      }}>
                        <strong style={{ fontSize: 13 }}>Survival</strong>
                        <span style={{ fontSize: 13, flex: 1, minWidth: 80 }}>
                          {selectedSurvivalTeam
                            ? <>{selectedSurvivalTeam}{survivalLocked ? ' (locked)' : ''}</>
                            : <span style={{ opacity: 0.65 }}>No team chosen</span>}
                          {mySurvivalPick && mySurvivalPick.result !== 'pending' && (
                            <span style={{ opacity: 0.65 }}>
                              {' '}· {mySurvivalPick.result} · {mySurvivalPick.points ?? 0} pts
                            </span>
                          )}
                        </span>

                        {!survivalLocked && (
                          <>
                            <button
                              type="button"
                              className={s.side}
                              style={{ padding: '3px 10px', fontSize: 12, minHeight: 0, width: 'auto' }}
                              disabled={survivalSaving}
                              onClick={() => setShowSurvivalPicker((v) => !v)}
                            >
                              {showSurvivalPicker ? 'Cancel' : selectedSurvivalTeam ? 'Change' : 'Choose'}
                            </button>
                            {selectedSurvivalTeam && !showSurvivalPicker && (
                              <button
                                type="button"
                                className={s.side}
                                style={{ padding: '3px 10px', fontSize: 12, minHeight: 0, width: 'auto' }}
                                disabled={survivalSaving}
                                onClick={clearSurvivalPick}
                              >
                                Clear
                              </button>
                            )}
                          </>
                        )}

                        <InfoTip title="Survival">
                          <p>
                            Choose one team each week. A correct pick earns 1 point and a wrong pick
                            loses 1 point.
                          </p>
                          <p>
                            Whether it wins or loses, that team is used up for the rest of the season
                            and can&apos;t be your Survival pick again. Teams you&apos;ve already used
                            are greyed out below.
                          </p>
                          {shareSurv && <p>Your Survival pick is applied to all your leagues that use Survival.</p>}
                        </InfoTip>
                        <StatusPill ok={!!selectedSurvivalTeam || allKicked} okText={selectedSurvivalTeam ? 'Set' : 'Auto'} todoText="Needed" />
                      </div>
                    )}

                    {survivalEnabled && showSurvivalPicker && (
                      <div style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        background: 'rgba(220, 38, 38, 0.07)',
                        borderTop: '1px solid rgba(220, 38, 38, 0.25)',
                      }}>
                        Tap a team below to make it this week&apos;s Survival pick. Your regular picks won&apos;t change.
                      </div>
                    )}

                    {confidenceEnabled && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        padding: '8px 12px',
                        borderTop: survivalEnabled ? '1px solid rgba(128, 128, 128, 0.25)' : 'none',
                      }}>
                        <strong style={{ fontSize: 13 }}>Confidence</strong>
                        <span style={{ fontSize: 13, flex: 1, minWidth: 80, opacity: 0.8 }}>
                          {allKicked ? 'All games locked' : `${confOpenGames.length - confMissing} of ${confOpenGames.length} numbered`} · {confEarned}/{confPossible} pts
                        </span>
                        {confMissing > 0 && !allKicked && (
                          <button
                            type="button"
                            className={s.side}
                            style={{ padding: '3px 10px', fontSize: 12, minHeight: 0, width: 'auto' }}
                            disabled={confSaving}
                            onClick={autofillConfidence}
                          >
                            Auto-fill
                          </button>
                        )}
                        {!allKicked && confOpenGames.some((g) => conf[g.id]?.explicit) && (
                          <button
                            type="button"
                            className={s.side}
                            style={{ padding: '3px 10px', fontSize: 12, minHeight: 0, width: 'auto' }}
                            disabled={confSaving}
                            onClick={clearAllConfidence}
                          >
                            Clear all
                          </button>
                        )}
                        <InfoTip title="Confidence Points">
                          <p>
                            Give every game a different number from 1 to {games.length} using the
                            Conf menu on each game. Numbers already used show as &ldquo;used&rdquo;;
                            picking one moves it to this game. Auto-fill numbers the blank games for you.
                            A correct pick scores its number; a wrong or missed pick scores nothing.
                          </p>
                          <p>
                            A game&apos;s number locks at its kickoff and the rest can still be
                            changed. A game still blank at kickoff gets the lowest leftover number.
                          </p>
                          {shareConf && <p>Your numbers are applied to all your leagues that use Confidence Points.</p>}
                        </InfoTip>
                        <StatusPill ok={confMissing === 0 || allKicked} okText={confMissing === 0 ? 'Set' : 'Auto'} todoText="Needed" />
                      </div>
                    )}
                  </div>
                )}

                {!beforeLeagueStart && (
                  <p
                    className={s.progress}
                    style={pickedCount < games.length ? { color: '#b45309', fontWeight: 600 } : undefined}
                  >
                    {pickedCount} of {games.length} picked. Unpicked games count as a loss.
                  </p>
                )}

                <div className={`${s.list} ${showSurvivalPicker ? 'survivalPicking' : ''}`}>
                  {games.map((g) => {
                    const locked =
                      beforeLeagueStart ||
                      now >= new Date(g.kickoff_at).getTime()

                    return (
                      <div key={g.id} className={s.game}>
                        <div className={s.gameTime} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

                          {confidenceEnabled && !beforeLeagueStart && conf[g.id] && (
                            <span
                              title="Confidence points: a correct pick scores this number"
                              style={{
                                marginLeft: 'auto',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                lineHeight: 1,
                              }}
                            >
                              {conf[g.id].is_final ? (
                                <span>{conf[g.id].correct ? `+${conf[g.id].points}` : '+0'}</span>
                              ) : locked && !conf[g.id].explicit ? (
                                <span style={{ opacity: 0.6 }}>auto</span>
                              ) : null}
                              <span>Conf</span>
                              <select
                                className={s.select}
                                style={{
                                  width: 'auto',
                                  minWidth: 0,
                                  height: 22,
                                  padding: '0 18px 0 6px',
                                  margin: 0,
                                  fontSize: 12,
                                  borderRadius: 6,
                                }}
                                value={locked || conf[g.id].explicit ? conf[g.id].value : ''}
                                disabled={locked || confSaving}
                                onChange={(e) =>
                                  changeConfidence(g, e.target.value === '' ? null : Number(e.target.value))
                                }
                              >
                                {!locked && <option value="">–</option>}
                                {Array.from({ length: games.length }, (_, i) => i + 1).map((v) => {
                                  const holder = holderOf(v, g.id)
                                  return (
                                    <option key={v} value={v}>
                                      {v}{holder ? (isOpen(holder) ? ' · used' : ' · locked') : ''}
                                    </option>
                                  )
                                })}
                              </select>
                            </span>
                          )}
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