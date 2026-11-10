'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import Crown from '../../Crown'
import { CompareHeaderButton, ComparePicker, ComparePicks, CrowdCount, useCompare, useCrowd } from './PickCrowd'

type Row = {
  user_id: string; username: string
  correct: number; total: number; weekly_wins: number; upset_points: number
}
type WeekRow = {
  week: number; user_id: string; username: string
  correct: number; graded: number; games_total: number; games_final: number
}
type Game = {
  game_id: number; week: number; kickoff_at: string
  home_team: string; away_team: string; home_score: number | null; away_score: number | null
  win_side: 'home' | 'away' | null; pick_side: 'home' | 'away' | null; locked: boolean; points: number
  status: string | null; period: number | null; clock: string | null
}

type CrownKey = 'correct' | 'weekly_wins' | 'upset_points'

const CROWNS: { key: CrownKey; name: string; unit: string }[] = [
  { key: 'correct', name: 'Most Correct', unit: 'correct' },
  { key: 'weekly_wins', name: 'Weekly Wins', unit: 'weeks won' },
  { key: 'upset_points', name: 'Upset Points', unit: 'pts' },
]

// "5 correct", "1 win", "466 pts"
function valueLabel(key: CrownKey, v: number) {
  if (key === 'weekly_wins') return `${v} ${v === 1 ? 'win' : 'wins'}`
  if (key === 'upset_points') return `${v} pts`
  return `${v} correct`
}

// "Q3 4:12", "Halftime", "OT 2:00"
function liveLabel(g: Game) {
  if (g.clock === 'Halftime') return 'Halftime'
  const p = g.period ?? 0
  const q = p > 4 ? 'OT' : p > 0 ? `Q${p}` : ''
  return [q, g.clock].filter(Boolean).join(' ') || 'In progress'
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Standard competition ranking: players with the same score share a place and the next place is skipped (1, 1, 3).
type Place = { rank: number; tied: boolean }
const placeText = (p: Place) => `${p.tied ? 'T-' : ''}${ordinal(p.rank)}`
function placeBy<T>(items: T[], id: (t: T) => string, score: (t: T) => number, lowerIsBetter = false) {
  const out = new Map<string, Place>()
  for (const it of items) {
    const v = score(it)
    const better = items.filter((o) => (lowerIsBetter ? score(o) < v : score(o) > v)).length
    const same = items.filter((o) => score(o) === v).length
    out.set(id(it), { rank: better + 1, tied: same > 1 })
  }
  return out
}

function winnersOf(rows: WeekRow[]) {
  const top = Math.max(0, ...rows.map((r) => r.correct))
  return top > 0 ? rows.filter((r) => r.correct === top) : []
}

function toggled(set: Set<number>, n: number) {
  const next = new Set(set)
  if (next.has(n)) next.delete(n)
  else next.add(n)
  return next
}

// weekHref (optional): where "Make picks" for the current week should go, e.g. (w) => `/leagues/${id}/picks?week=${w}`
// viewUserId (optional): show another player's page (their stats and their locked picks only)
export default function RaceForTripleCrown({
  leagueId, weekHref, viewUserId,
}: { leagueId: string; weekHref?: (week: number) => string; viewUserId?: string }) {
  const viewing = !!viewUserId
  const [rows, setRows] = useState<Row[] | null>(null)
  const [weekRows, setWeekRows] = useState<WeekRow[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [error, setError] = useState('')
  const [openResults, setOpenResults] = useState<Set<number>>(new Set())
  const [openPicks, setOpenPicks] = useState<Set<number>>(new Set())
  const [me, setMe] = useState<string | null>(null)
  const [openCrown, setOpenCrown] = useState<CrownKey | null>(null)
  const [showAll, setShowAll] = useState(false)
  const crowd = useCrowd(leagueId)
  const cmp = useCompare(leagueId)
  const { prune } = cmp
  // comparing ends when you hide the picks panel
  useEffect(() => { prune(openPicks) }, [openPicks, prune])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMe(user?.id ?? null))
  }, [])

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.rpc('league_standings', { p_league: leagueId }),
      supabase.rpc('league_week_results', { p_league: leagueId }),
      supabase.rpc('league_member_week_picks', { p_league: leagueId, p_user: viewUserId ?? null }),
    ])
    const err = a.error ?? b.error ?? c.error
    if (err) { setError(err.message); return }
    setError('')
    setRows((a.data ?? []) as Row[])
    setWeekRows((b.data ?? []) as WeekRow[])
    setGames((c.data ?? []) as Game[])
  }, [leagueId, viewUserId])

  useEffect(() => { load() }, [load])

  // Real time: whenever a game changes (score, clock, final) refresh the standings and picks.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(load, 800)
    }
    const ch = supabase
      .channel(`tc-games-${leagueId}-${viewUserId ?? 'me'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, refresh)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(ch)
    }
  }, [load, leagueId, viewUserId])

  // Safety net in case realtime is unavailable: re-check every 30s while a game is live.
  const anyLive = games.some((g) => g.status === 'live')
  useEffect(() => {
    if (!anyLive) return
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [anyLive, load])

  if (error) return <div className="tc-error">{error}</div>
  if (!rows) return null

  // Crown leaders
  const leaders = CROWNS.map((c) => {
    const top = Math.max(0, ...rows.map((r) => r[c.key]))
    return { ...c, top, who: top > 0 ? rows.filter((r) => r[c.key] === top) : [] }
  })
  const leadsOf = (id: string) => leaders.filter((l) => l.who.some((w) => w.user_id === id)).map((l) => l.key)
  const tripleHolder = rows.find((r) => leadsOf(r.user_id).length === 3)

  // Places in each crown, and the overall ranking by average placement (lower is better).
  // Ties share a place for now; tiebreakers get added later.
  const places = Object.fromEntries(
    CROWNS.map((c) => [c.key, placeBy(rows, (r) => r.user_id, (r) => r[c.key])]),
  ) as Record<CrownKey, Map<string, Place>>
  const rankSum = (id: string) => CROWNS.reduce((n, c) => n + (places[c.key].get(id)?.rank ?? rows.length), 0)
  const avgOf = (id: string) => (rankSum(id) / CROWNS.length).toFixed(1)
  const overall = [...rows].sort((a, b) => rankSum(a.user_id) - rankSum(b.user_id) || a.username.localeCompare(b.username))
  const overallPlace = placeBy(rows, (r) => r.user_id, (r) => rankSum(r.user_id), true)
  const top3 = overall.slice(0, 3)
  const myRow = me ? rows.find((r) => r.user_id === me) : undefined
  const others = rows.filter((r) => r.user_id !== me).map((r) => ({ user_id: r.user_id, username: r.username }))
  const youOutsideTop3 = myRow && !top3.some((r) => r.user_id === myRow.user_id) ? myRow : null
  const openDef = CROWNS.find((c) => c.key === openCrown)
  const anyStandings = leaders.some((l) => l.top > 0)

  function toggleCrown(key: CrownKey) {
    setOpenCrown(openCrown === key ? null : key)
  }

  // Weeks: current = the earliest week that still has unfinished games (else the latest week)
  const byWeek = new Map<number, WeekRow[]>()
  weekRows.forEach((r) => byWeek.set(r.week, [...(byWeek.get(r.week) ?? []), r]))
  const gamesByWeek = new Map<number, Game[]>()
  games.forEach((g) => gamesByWeek.set(g.week, [...(gamesByWeek.get(g.week) ?? []), g]))
  // Weeks come from the schedule itself (not from results), so future weeks show up before anyone has picked.
  // A game is final once it has a winner or both scores (a tie has scores but no winner side).
  const weeks = [...gamesByWeek.keys()].sort((a, b) => a - b)
  const isFinal = (g: Game) =>
    g.status === 'final' || g.win_side !== null || (g.status !== 'live' && g.home_score !== null && g.away_score !== null)
  const totalOf = (w: number) => gamesByWeek.get(w)?.length ?? 0
  const finalOf = (w: number) => (gamesByWeek.get(w) ?? []).filter(isFinal).length
  const isDone = (w: number) => totalOf(w) > 0 && finalOf(w) === totalOf(w)
  const currentWeek = weeks.find((w) => !isDone(w)) ?? weeks[weeks.length - 1]
  const futureWeeks = weeks.filter((w) => currentWeek !== undefined && w > currentWeek)
  const pastWeeks = weeks.filter((w) => currentWeek !== undefined && w < currentWeek).sort((a, b) => b - a)
  const cur = currentWeek !== undefined ? byWeek.get(currentWeek) ?? [] : []
  const curWinners = winnersOf(cur)

  function PicksPanel({ week }: { week: number }) {
    const list = gamesByWeek.get(week) ?? []
    if (!viewing && cmp.isOpen(week)) {
      return (
        <ComparePicks week={week} games={list} cmp={cmp}
          members={(rows ?? []).filter((r) => r.user_id !== me).map((r) => ({ user_id: r.user_id, username: r.username }))} />
      )
    }
    return (
      <div className="tc-gmList">
        {list.map((g) => {
          const final = g.win_side !== null
          const right = final && g.pick_side !== null && g.pick_side === g.win_side
          const wrong = final && g.pick_side !== null && g.pick_side !== g.win_side
          return (
            <div key={g.game_id} className={`tc-gm ${right ? 'tc-gmRight' : wrong ? 'tc-gmWrong' : ''}`}>
              {g.status === 'live' && (
                <div className="tc-gmLive"><span className="tc-liveDot" />LIVE · {liveLabel(g)}</div>
              )}
              {(['away', 'home'] as const).map((side) => (
                <div key={side} className={`tc-gmTeam ${g.pick_side === side ? 'tc-gmPicked' : ''}`}>
                  <span className="tc-gmName">
                    {side === 'home' ? g.home_team : g.away_team}
                    {g.win_side === side && <Crown className="tc-gameCrown" />}
                    {g.pick_side === side && (
                      <span className="tc-gmTag">
                        {viewing && me && viewUserId !== me ? 'Their pick' : 'Your pick'}
                      </span>
                    )}
                     {g.locked && <CrowdCount names={crowd.get(`${g.game_id}:${side}`)} />}
                  </span>                      
                  <span className="tc-gmScore">{side === 'home' ? g.home_score : g.away_score}</span>
                </div>
              ))}
              {!g.pick_side && (
                <div className="tc-gmNote">
                  {viewing && !g.locked
                    ? 'Hidden until kickoff'
                    : final ? 'No pick made' : g.locked ? 'No pick made' : 'No pick yet'}
                </div>
              )}
              {g.pick_side && g.status === 'live' && !final && (
                <div className="tc-gmNote">Scores when the game ends</div>
              )}
              {g.pick_side && final && (
                <div className="tc-gmFoot">
                  <span className={`tc-gmNote ${right ? 'tc-gmNoteRight' : 'tc-gmNoteWrong'}`}>
                    {right ? 'Correct' : 'Missed'}
                  </span>
                  <span className={`tc-pts ${g.points > 0 ? 'tc-ptsPos' : ''}`}>+{g.points}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
    <ComparePicker cmp={cmp} members={others} />
      {viewing ? (
        <>
          <div className="tc-sectionTitle">Triple Crown standing</div>
          <div className="tc-raceTiles">
            {CROWNS.map((c) => {
              const mine = rows.find((r) => r.user_id === viewUserId)
              const lead = leadsOf(viewUserId!).includes(c.key)
              const place = places[c.key].get(viewUserId!)
              return (
                <div key={c.key} className={`tc-raceTile ${lead ? 'tc-raceTileLead' : ''}`}>
                  <Crown className="tc-raceCrown" />
                  <div className="tc-raceName">{c.name}</div>
                  <div className="tc-raceLeader">{mine ? mine[c.key] : 0}</div>
                  <div className="tc-raceStat">
                    {lead ? `Leading · ${c.unit}` : `${place ? `${placeText(place)} · ` : ''}${c.unit}`}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
      <>
      <div className="tc-sectionTitle">Race for the Triple Crown</div>
      <div className="tc-raceTiles">
        {leaders.map((l) => (
          <div
            key={l.key}
            role="button"
            tabIndex={0}
            aria-expanded={openCrown === l.key}
            className={`tc-raceTile tc-raceTileBtn ${l.who.length ? 'tc-raceTileLead' : ''} ${openCrown === l.key ? 'tc-raceTileOpen' : ''}`}
            onClick={() => toggleCrown(l.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCrown(l.key) }
            }}
          >
            <Crown className="tc-raceCrown" />
            <div className="tc-raceName">{l.name}</div>
            {l.who.length ? (
              <>
                <div className="tc-raceLeader">{l.who.map((w) => w.username).join(' & ')}</div>
                <div className="tc-raceStat">{l.top} {l.unit}{l.who.length > 1 ? ' (tied)' : ''}</div>
              </>
            ) : (
              <div className="tc-raceStat">No leader yet</div>
            )}
            {l.top > 0 && myRow && (
              <div className="tc-raceYou">You: {placeText(places[l.key].get(myRow.user_id)!)}</div>
            )}
          </div>
        ))}
      </div>
      <p className="tc-lbHint">Tap a crown to see everyone&apos;s standing.</p>

      {openDef && (
        <div className="tc-lbPanel">
          <div className="tc-lbHead">
            <span>{openDef.name} · full standings</span>
            <button className="tc-lbClose" onClick={() => setOpenCrown(null)}>Close</button>
          </div>
          {[...rows]
            .sort((a, b) => b[openDef.key] - a[openDef.key] || a.username.localeCompare(b.username))
            .map((r) => (
              <div key={r.user_id} className={`tc-lbRow ${r.user_id === me ? 'tc-lbMe' : ''}`}>
                <span className="tc-lbRank">{placeText(places[openDef.key].get(r.user_id)!)}</span>
                <span className="tc-lbName">
                  {r.username}{r.user_id === me && <span className="tc-youTag">You</span>}
                </span>
                <span className="tc-lbVal">{valueLabel(openDef.key, r[openDef.key])}</span>
              </div>
            ))}
        </div>
      )}

      {tripleHolder && (
        <div className="tc-raceBanner">{tripleHolder.username} is on track for the Triple Crown!</div>
      )}

      <div className="tc-sectionTitle">Ultimate winner · average placement</div>
      {anyStandings ? (
        <>
          <div className="tc-pdm">
            {/* Olympic layout: 2nd on the left, 1st in the middle, 3rd on the right. Height and color follow the PLACE, so ties share a height. */}
            {[top3[1], top3[0], top3[2]].filter(Boolean).map((r) => {
              const pl = overallPlace.get(r.user_id)!
              const tier = pl.rank >= 1 && pl.rank <= 3 ? (['gold', 'silver', 'bronze'] as const)[pl.rank - 1] : 'plain'
              return (
                <div key={r.user_id} className="tc-pdmCol">
                  <div className="tc-pdmName">
                    {r.username}{r.user_id === me && <span className="tc-youTag">You</span>}
                  </div>
                  <div className={`tc-pdmBlock tc-pdmBlock-${tier} ${r.user_id === me ? 'tc-pdmMe' : ''}`}>
                    <div className="tc-pdmPlace">{placeText(pl)}</div>
                    <div className="tc-pdmAvg">avg {avgOf(r.user_id)}</div>
                    <div className="tc-pdmSub">{CROWNS.map((c) => placeText(places[c.key].get(r.user_id)!)).join(' · ')}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {!showAll && youOutsideTop3 && (
            <div className="tc-lbYouLine">
              You: <strong>{placeText(overallPlace.get(youOutsideTop3.user_id)!)}</strong> · avg {avgOf(youOutsideTop3.user_id)}
            </div>
          )}

          {showAll && overall.length > 3 && (
            <div className="tc-lbPanel">
              {overall.slice(3).map((r) => (
                <div key={r.user_id} className={`tc-lbRow ${r.user_id === me ? 'tc-lbMe' : ''}`}>
                  <span className="tc-lbRank">{placeText(overallPlace.get(r.user_id)!)}</span>
                  <span className="tc-lbName">
                    {r.username}{r.user_id === me && <span className="tc-youTag">You</span>}
                    <span className="tc-lbSub">
                      {CROWNS.map((c) => placeText(places[c.key].get(r.user_id)!)).join(' · ')}
                    </span>
                  </span>
                  <span className="tc-lbVal">avg {avgOf(r.user_id)}</span>
                </div>
              ))}
            </div>
          )}
          {overall.length > 3 && (
            <button className="tc-lbMore" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show top 3' : `Full ranking (${overall.length})`}
            </button>
          )}
          <p className="tc-lbHint">
            Average of each player&apos;s place in Most Correct, Weekly Wins and Upset Points (shown in that order). Lower is better.
          </p>
        </>
      ) : (
        <p className="tc-lbHint">Standings appear once the first games are final.</p>
      )}

      </>
      )}

      {currentWeek !== undefined && (
        <>
          <div className="tc-sectionTitle">This week · Week {currentWeek}</div>
          <div className="tc-pw">
            <div className="tc-pwHead tc-pwHeadStatic">
              <div>
                <div className="tc-pwSub">{finalOf(currentWeek)} of {totalOf(currentWeek)} games final</div>
              </div>
              <div className="tc-pwBtns">
                {weekHref && <a className="tc-pwBtn tc-pwBtnPrimary" href={weekHref(currentWeek)}>Make picks</a>}
                <CompareHeaderButton week={currentWeek} cmp={cmp} show={!viewing && openPicks.has(currentWeek)} />
                <button className="tc-pwBtn" onClick={() => setOpenPicks(toggled(openPicks, currentWeek))}>
                  {openPicks.has(currentWeek) ? 'Hide picks' : viewing ? 'View picks' : 'View my picks'}
                </button>
              </div>
            </div>
            {!viewing && (
              <div className="tc-pwRow">
                <span>
                  {(gamesByWeek.get(currentWeek) ?? []).filter((g) => g.pick_side !== null).length} of {totalOf(currentWeek)} games picked
                </span>
              </div>
            )}
            {finalOf(currentWeek) === 0 ? (
              <div className="tc-pwRow"><span>No results yet. Check back after the games.</span></div>
            ) : (
              cur.map((r) => (
                <div key={r.user_id} className="tc-pwRow">
                  <span className={curWinners.some((w) => w.user_id === r.user_id) ? 'tc-raceWinner' : ''}>
                    {r.username}{curWinners.some((w) => w.user_id === r.user_id) ? ' · leading' : ''}
                  </span>
                  <span>{r.correct}/{r.graded}</span>
                </div>
              ))
            )}
            {openPicks.has(currentWeek) && <PicksPanel week={currentWeek} />}
          </div>
        </>
      )}

      {!viewing && futureWeeks.length > 0 && (
        <details className="tc-racePast">
          <summary>Future weeks ({futureWeeks.length})</summary>
          {futureWeeks.map((w) => {
            const picked = (gamesByWeek.get(w) ?? []).filter((g) => g.pick_side !== null).length
            return (
              <div key={w} className="tc-pw tc-pwInner">
                <div className="tc-pwHead tc-pwHeadStatic">
                  <div>
                    <div className="tc-pwTitle">Week {w}</div>
                    <div className="tc-pwSub">{totalOf(w)} games · {picked} of {totalOf(w)} picked</div>
                  </div>
                  <div className="tc-pwBtns">
                    {weekHref && <a className="tc-pwBtn tc-pwBtnPrimary" href={weekHref(w)}>Make picks</a>}
                    <CompareHeaderButton week={w} cmp={cmp} show={!viewing && openPicks.has(w)} />
                    <button className="tc-pwBtn" onClick={() => setOpenPicks(toggled(openPicks, w))}>
                      {openPicks.has(w) ? 'Hide picks' : 'View my picks'}
                    </button>
                  </div>
                </div>
                {openPicks.has(w) && <PicksPanel week={w} />}
              </div>
            )
          })}
        </details>
      )}

      {pastWeeks.length > 0 && (
        <details className="tc-racePast">
          <summary>Past weeks ({pastWeeks.length})</summary>
          {pastWeeks.map((w) => {
            const wr = byWeek.get(w) ?? []
            const win = winnersOf(wr)
            const resultsOpen = openResults.has(w)
            return (
              <div key={w} className="tc-pw tc-pwInner">
                <div
                  className="tc-pwHead"
                  role="button"
                  tabIndex={0}
                  aria-expanded={resultsOpen}
                  onClick={() => setOpenResults(toggled(openResults, w))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpenResults(toggled(openResults, w))
                    }
                  }}
                >
                  <div>
                    <div className="tc-pwTitle">Week {w}</div>
                    <div className="tc-pwSub">
                      {win.length ? `Winner: ${win.map((x) => x.username).join(' & ')}` : 'No winner'} · {totalOf(w)} games
                    </div>
                  </div>
                  <div className="tc-pwBtns">
                    <CompareHeaderButton week={w} cmp={cmp} show={!viewing && openPicks.has(w)} />
                    <button
                      className="tc-pwBtn"
                      onClick={(e) => { e.stopPropagation(); setOpenPicks(toggled(openPicks, w)) }}
                    >
                      {openPicks.has(w) ? 'Hide picks' : viewing ? 'View picks' : 'View my picks'}
                    </button>
                    <span className="tc-pwChevron">{resultsOpen ? '▾' : '▸'}</span>
                  </div>
                </div>
                {resultsOpen && wr.map((r) => (
                  <div key={r.user_id} className="tc-pwRow">
                    <span className={win.some((x) => x.user_id === r.user_id) ? 'tc-raceWinner' : ''}>
                      {r.username}
                    </span>
                    <span>{r.correct}/{r.graded}</span>
                  </div>
                ))}
                {openPicks.has(w) && <PicksPanel week={w} />}
              </div>
            )
          })}
        </details>
      )}
    </>
  )
}
