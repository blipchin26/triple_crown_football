'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import Crown from '../../Crown'

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
}

const CROWNS: { key: 'correct' | 'weekly_wins' | 'upset_points'; name: string; unit: string }[] = [
  { key: 'correct', name: 'Most Correct', unit: 'correct' },
  { key: 'weekly_wins', name: 'Weekly Wins', unit: 'weeks won' },
  { key: 'upset_points', name: 'Upset Points', unit: 'pts' },
]

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

  useEffect(() => {
    async function load() {
      const [a, b, c] = await Promise.all([
        supabase.rpc('league_standings', { p_league: leagueId }),
        supabase.rpc('league_week_results', { p_league: leagueId }),
        supabase.rpc('league_member_week_picks', { p_league: leagueId, p_user: viewUserId ?? null }),
      ])
      const err = a.error ?? b.error ?? c.error
      if (err) { setError(err.message); return }
      setRows((a.data ?? []) as Row[])
      setWeekRows((b.data ?? []) as WeekRow[])
      setGames((c.data ?? []) as Game[])
    }
    load()
  }, [leagueId, viewUserId])

  if (error) return <div className="tc-error">{error}</div>
  if (!rows) return null

  // Crown leaders
  const leaders = CROWNS.map((c) => {
    const top = Math.max(0, ...rows.map((r) => r[c.key]))
    return { ...c, top, who: top > 0 ? rows.filter((r) => r[c.key] === top) : [] }
  })
  const leadsOf = (id: string) => leaders.filter((l) => l.who.some((w) => w.user_id === id)).map((l) => l.key)
  const tripleHolder = rows.find((r) => leadsOf(r.user_id).length === 3)

  // Weeks: current = the earliest week that still has unfinished games (else the latest week)
  const byWeek = new Map<number, WeekRow[]>()
  weekRows.forEach((r) => byWeek.set(r.week, [...(byWeek.get(r.week) ?? []), r]))
  const gamesByWeek = new Map<number, Game[]>()
  games.forEach((g) => gamesByWeek.set(g.week, [...(gamesByWeek.get(g.week) ?? []), g]))
  const weeks = [...byWeek.keys()].sort((a, b) => a - b)
  const isDone = (w: number) => byWeek.get(w)![0].games_final === byWeek.get(w)![0].games_total
  const currentWeek = weeks.find((w) => !isDone(w)) ?? weeks[weeks.length - 1]
  const pastWeeks = weeks.filter((w) => w !== currentWeek && isDone(w)).sort((a, b) => b - a)
  const cur = currentWeek !== undefined ? byWeek.get(currentWeek)! : []
  const curWinners = winnersOf(cur)

  function PicksPanel({ week }: { week: number }) {
    const list = gamesByWeek.get(week) ?? []
    return (
      <div className="tc-gmList">
        {list.map((g) => {
          const final = g.win_side !== null
          const right = final && g.pick_side !== null && g.pick_side === g.win_side
          const wrong = final && g.pick_side !== null && g.pick_side !== g.win_side
          return (
            <div key={g.game_id} className={`tc-gm ${right ? 'tc-gmRight' : wrong ? 'tc-gmWrong' : ''}`}>
              {(['away', 'home'] as const).map((side) => (
                <div key={side} className={`tc-gmTeam ${g.pick_side === side ? 'tc-gmPicked' : ''}`}>
                  <span className="tc-gmName">
                    {side === 'home' ? g.home_team : g.away_team}
                    {g.win_side === side && <Crown className="tc-gameCrown" />}
                    {g.pick_side === side && <span className="tc-gmTag">Your pick</span>}
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
      {viewing ? (
        <>
          <div className="tc-sectionTitle">Triple Crown standing</div>
          <div className="tc-raceTiles">
            {CROWNS.map((c) => {
              const mine = rows.find((r) => r.user_id === viewUserId)
              const lead = leadsOf(viewUserId!).includes(c.key)
              return (
                <div key={c.key} className={`tc-raceTile ${lead ? 'tc-raceTileLead' : ''}`}>
                  <Crown className="tc-raceCrown" />
                  <div className="tc-raceName">{c.name}</div>
                  <div className="tc-raceLeader">{mine ? mine[c.key] : 0}</div>
                  <div className="tc-raceStat">{lead ? `Leading · ${c.unit}` : c.unit}</div>
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
          <div key={l.key} className={`tc-raceTile ${l.who.length ? 'tc-raceTileLead' : ''}`}>
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
          </div>
        ))}
      </div>

      {tripleHolder && (
        <div className="tc-raceBanner">{tripleHolder.username} is on track for the Triple Crown!</div>
      )}

      <div className="tc-raceTable">
        <div className="tc-raceRow tc-raceHead">
          <span>Player</span><span>Correct</span><span>Wk wins</span><span>Upset pts</span>
        </div>
        {rows.map((r) => (
          <div key={r.user_id} className="tc-raceRow">
            <span className="tc-raceName2">{r.username}</span>
            {CROWNS.map((c) => (
              <span key={c.key} className={leadsOf(r.user_id).includes(c.key) ? 'tc-raceLeadCell' : ''}>
                {r[c.key]}
              </span>
            ))}
          </div>
        ))}
      </div>
      </>
      )}

      {currentWeek !== undefined && (
        <>
          <div className="tc-sectionTitle">This week · Week {currentWeek}</div>
          <div className="tc-pw">
            <div className="tc-pwHead tc-pwHeadStatic">
              <div>
                <div className="tc-pwSub">{cur[0].games_final} of {cur[0].games_total} games final</div>
              </div>
              <div className="tc-pwBtns">
                {weekHref && <a className="tc-pwBtn tc-pwBtnPrimary" href={weekHref(currentWeek)}>Make picks</a>}
                <button className="tc-pwBtn" onClick={() => setOpenPicks(toggled(openPicks, currentWeek))}>
                  {openPicks.has(currentWeek) ? 'Hide picks' : viewing ? 'View picks' : 'View my picks'}
                </button>
              </div>
            </div>
            {cur[0].games_final === 0 ? (
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

      {pastWeeks.length > 0 && (
        <details className="tc-racePast">
          <summary>Past weeks ({pastWeeks.length})</summary>
          {pastWeeks.map((w) => {
            const wr = byWeek.get(w)!
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
                      {win.length ? `Winner: ${win.map((x) => x.username).join(' & ')}` : 'No winner'} · {wr[0].games_total} games
                    </div>
                  </div>
                  <div className="tc-pwBtns">
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
