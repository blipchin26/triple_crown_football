'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// ---------- Everyone's picks (the little counts next to each team) ----------

type CrowdRow = { game_id: number; side: 'home' | 'away'; user_id: string; username: string }

// Map of "gameId:side" -> usernames who picked that side (revealed games only, never yourself).
export function useCrowd(leagueId: string) {
  const [crowd, setCrowd] = useState<Map<string, string[]>>(new Map())
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase.rpc('league_game_crowd', { p_league: leagueId })
      if (!alive || error) return          // before the SQL is run this just shows nothing
      const m = new Map<string, string[]>()
      ;((data ?? []) as CrowdRow[]).forEach((r) => {
        const k = `${r.game_id}:${r.side}`
        m.set(k, [...(m.get(k) ?? []), r.username])
      })
      setCrowd(m)
    }
    load()
    const t = setInterval(load, 60_000)     // picks reveal as games kick off
    return () => { alive = false; clearInterval(t) }
  }, [leagueId])
  return crowd
}

// A small count bubble; hover (or tap/focus) shows who picked this team.
// Place it AFTER the "Your pick" tag, not inside it, so it is its own bubble.
export function CrowdCount({ names }: { names?: string[] }) {
  if (!names || names.length === 0) return null
  return (
    <i className="tc-crowd" tabIndex={0} aria-label={`Picked by ${names.join(', ')}`}>
      {names.length}
      <u className="tc-crowdTip" role="tooltip">{names.join(', ')}</u>
    </i>
  )
}

// ---------- Compare my picks ----------

export type CompareGame = {
  game_id: number; home_team: string; away_team: string
  home_score: number | null; away_score: number | null
  win_side: string | null; pick_side: string | null; locked: boolean; points: number
  status?: string | null
}
type Member = { user_id: string; username: string }

// byWeek: the player you're comparing with, per week. picker: the week whose "choose a player" popup is open.
export function useCompare(leagueId: string) {
  const [byWeek, setByWeek] = useState<Record<number, string>>({})
  const [picker, setPicker] = useState<number | null>(null)
  const [picks, setPicks] = useState<Record<string, CompareGame[]>>({})
  const [err, setErr] = useState('')

  const start = (week: number) => setPicker(week)
  const cancel = () => setPicker(null)
  const close = (week: number) => setByWeek((s) => { const n = { ...s }; delete n[week]; return n })
  // call with the set of weeks whose picks panel is open: comparing ends when the panel is hidden
  const prune = useCallback((open: Set<number>) => {
    setPicker((p) => (p !== null && !open.has(p) ? null : p))
    setByWeek((s) => {
      const keep = Object.keys(s).filter((w) => open.has(Number(w)))
      return keep.length === Object.keys(s).length ? s : Object.fromEntries(keep.map((w) => [w, s[Number(w)]]))
    })
  }, [])

  async function choose(week: number, userId: string) {
    setPicker(null)
    setByWeek((s) => ({ ...s, [week]: userId }))
    if (picks[userId]) return
    setErr('')
    const { data, error } = await supabase.rpc('league_member_week_picks', { p_league: leagueId, p_user: userId })
    if (error) return setErr(error.message)
    setPicks((p) => ({ ...p, [userId]: (data ?? []) as CompareGame[] }))
  }

  return { byWeek, picker, picks, err, start, cancel, close, choose, prune, isOpen: (w: number) => w in byWeek }
}
export type CompareApi = ReturnType<typeof useCompare>

// The "Compare" button for a week's header row, next to Make picks / Hide picks.
// Only shows while your own picks are open (pass show={!viewing && openPicks.has(week)}).
export function CompareHeaderButton({ week, cmp, show }: { week: number; cmp: CompareApi; show: boolean }) {
  if (!show) return null
  return (
    <button className="tc-pwBtn" onClick={(e) => { e.stopPropagation(); cmp.start(week) }}>Compare</button>
  )
}

// The popup: renders once, anywhere. It is centered on the screen over a dimmed backdrop.
export function ComparePicker({ cmp, members }: { cmp: CompareApi; members: Member[] }) {
  const week = cmp.picker
  useEffect(() => {
    if (week === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cmp.cancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [week]) // eslint-disable-line react-hooks/exhaustive-deps
  if (week === null) return null
  return (
    <div className="tc-modalBack" onMouseDown={(e) => { if (e.target === e.currentTarget) cmp.cancel() }}>
      <div className="tc-modal" role="dialog" aria-modal="true" aria-labelledby="tc-cmp-title">
        <div className="tc-modalTitle" id="tc-cmp-title">Compare your picks</div>
        <div className="tc-modalSub">
          Week {week}. Choose a player and you&apos;ll see your picks next to theirs, game by game.
          Picks for games that haven&apos;t started stay hidden.
        </div>
        <div className="tc-modalList">
          {members.length === 0 && <div className="tc-cmpHint">There are no other players in this league yet.</div>}
          {members.map((m) => (
            <button key={m.user_id} className="tc-modalPlayer" onClick={() => cmp.choose(week, m.user_id)}>
              <span className="tc-cmpInit">{m.username.charAt(0).toUpperCase()}</span>
              <span className="tc-modalName">{m.username}</span>
              <span className="tc-modalGo">Compare ›</span>
            </button>
          ))}
        </div>
        <button className="tc-modalCancel" onClick={cmp.cancel}>Cancel</button>
      </div>
    </div>
  )
}

// Side-by-side: your pick vs another player's pick, one bubble per game.
export function ComparePicks({ week, games, members, cmp }: {
  week: number; games: CompareGame[]; members: Member[]; cmp: CompareApi
}) {
  const otherId = cmp.byWeek[week] ?? null
  const other = members.find((m) => m.user_id === otherId)
  const theirs = otherId ? new Map((cmp.picks[otherId] ?? []).map((g) => [g.game_id, g])) : null
  const loaded = !!(otherId && cmp.picks[otherId])
  const isFinal = (g: CompareGame) => g.win_side !== null || g.status === 'final'
  const team = (g: CompareGame, side: string | null) => (side === 'home' ? g.home_team : side === 'away' ? g.away_team : null)

  let same = 0, both = 0
  if (loaded) games.forEach((g) => {
    const t = theirs!.get(g.game_id)
    if (g.pick_side && t?.pick_side) { both++; if (g.pick_side === t.pick_side) same++ }
  })

  return (
    <div className="tc-cmp">
      <div className="tc-cmpTop">
        <div className="tc-cmpTitle">You vs <strong>{other?.username ?? '...'}</strong></div>
        <div className="tc-cmpBtns">
          <button className="tc-cmpClose" onClick={() => cmp.start(week)}>Change player</button>
          <button className="tc-cmpClose" onClick={() => cmp.close(week)}>Close</button>
        </div>
      </div>

      {cmp.err && <div className="tc-error">{cmp.err}</div>}
      {otherId && !loaded && !cmp.err && <div className="tc-cmpHint">Loading...</div>}

      {loaded && other && (
        <>
          <div className="tc-cmpSummary">
            {both > 0
              ? <>Same pick in <strong>{same} of {both}</strong> games</>
              : <>No games to compare yet. Picks show once a game kicks off.</>}
          </div>
          {games.map((g) => {
            const t = theirs!.get(g.game_id)
            const final = isFinal(g)
            const cell = (who: string, side: string | null, hiddenText: string, pts: number) => {
              const name = team(g, side)
              const right = final && side !== null && side === g.win_side
              const wrong = final && side !== null && side !== g.win_side
              return (
                <div className={`tc-cmpCell ${right ? 'tc-cmpRight' : wrong ? 'tc-cmpWrong' : ''} ${name ? '' : 'tc-cmpNone'}`}>
                  <div className="tc-cmpWho">{who}</div>
                  <div className="tc-cmpPick">{name ?? hiddenText}</div>
                  {final && name && <div className="tc-cmpRes">{right ? `Correct +${pts}` : 'Missed'}</div>}
                </div>
              )
            }
            const hasScore = g.away_score !== null && g.home_score !== null
            return (
              <div key={g.game_id} className="tc-cmpGame">
                <div className="tc-cmpMatch">
                  <span>{g.away_team} @ {g.home_team}</span>
                  {hasScore && <span className="tc-cmpScore">{g.away_score}-{g.home_score}</span>}
                  {g.pick_side && t?.pick_side && g.pick_side === t.pick_side && <span className="tc-cmpSame">Same pick</span>}
                </div>
                <div className="tc-cmpRow">
                  {cell('You', g.pick_side, g.locked || final ? 'No pick' : 'No pick yet', g.points)}
                  {cell(other.username, t?.pick_side ?? null, g.locked || final ? 'No pick' : 'Hidden until kickoff', t?.points ?? 0)}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}