'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import s from '../../styles'

export type BetGame = {
  id: number; kickoff_at: string; away_team: string; home_team: string
  away_win_prob: number | null; home_win_prob: number | null
}
export type Bet = { game_id: number; side: 'home' | 'away'; stake: number; status: 'open' | 'won' | 'lost' | 'push'; profit: number }
type Tokens = { balance: number; committed: number; available: number }

const norm = (p: number | null) => (p == null ? null : p > 1 ? p / 100 : p)
// Same maths as the database: profit on a win is floor(stake * (1 - p) / p). 56% and 100 tokens wins 78.
export const betProfit = (stake: number, p: number | null) => {
  const q = norm(p)
  return q == null || q <= 0 ? 0 : Math.floor((stake * (1 - q)) / Math.max(q, 0.01))
}

// Loads your bets and token balance for the games on screen. Call it ONCE near the top of the page
// (before any early return), then pass the result to each <BetPanel/>.
export function useBetting(gameIds: number[]) {
  const [bets, setBets] = useState<Record<number, Bet>>({})
  const [tokens, setTokens] = useState<Tokens | null>(null)
  const key = gameIds.join(',')

  const refresh = useCallback(async () => {
    const ids = key ? key.split(',').map(Number) : []
    const [tk, bt] = await Promise.all([
      supabase.rpc('my_tokens'),
      ids.length ? supabase.from('bets').select('game_id, side, stake, status, profit').in('game_id', ids) : Promise.resolve({ data: [] }),
    ])
    setTokens((tk.data as Tokens[] | null)?.[0] ?? null)
    const m: Record<number, Bet> = {}
    for (const b of ((bt.data ?? []) as Bet[])) m[b.game_id] = b
    setBets(m)
  }, [key])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60000)                       // pick up settled bets while the page is open
    const vis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [refresh])

  async function place(game: number, side: 'home' | 'away', stake: number) {
    const { error } = await supabase.rpc('place_bet', { p_game: game, p_side: side, p_stake: stake })
    if (!error) await refresh()
    return error?.message ?? null
  }
  async function cancel(game: number) {
    const { error } = await supabase.rpc('cancel_bet', { p_game: game })
    if (!error) await refresh()
    return error?.message ?? null
  }
  return { bets, tokens, place, cancel, refresh }
}
export type Betting = ReturnType<typeof useBetting>

export default function BetPanel({ game, betting }: { game: BetGame; betting: Betting }) {
  const { bets, tokens } = betting
  const bet = bets[game.id]
  const locked = Date.now() >= new Date(game.kickoff_at).getTime()
  const hasOdds = game.home_win_prob != null && game.away_win_prob != null
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'home' | 'away'>('home')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const teamOf = (sd: 'home' | 'away') => (sd === 'home' ? game.home_team : game.away_team)
  const probOf = (sd: 'home' | 'away') => (sd === 'home' ? game.home_win_prob : game.away_win_prob)

  // free tokens for THIS bet = available, plus whatever this game's current bet already has tied up
  const free = tokens ? tokens.available + (bet?.status === 'open' ? bet.stake : 0) : 0
  const stake = Math.floor(Number(amount))
  const valid = Number.isFinite(stake) && stake >= 1 && stake <= free

  // ----- after kickoff: read-only result -----
  if (locked) {
    if (!bet) return null
    const label = bet.status === 'open' ? 'Pending'
      : bet.status === 'won' ? `Won +${bet.profit}` : bet.status === 'lost' ? `Lost −${bet.stake}` : 'Tie, refunded'
    return (
      <div className={`${s.bet} ${s.betDone}`}>
        <span><i className={s.coin} aria-hidden="true">T</i>Bet {bet.stake} on {teamOf(bet.side)}</span>
        <b className={bet.status === 'won' ? s.plus : bet.status === 'lost' ? s.minus : undefined}>{label}</b>
      </div>
    )
  }
  if (!hasOdds || !tokens) return null

  async function submit() {
    if (!valid) return
    setBusy(true); setErr('')
    const e = await betting.place(game.id, side, stake)
    setBusy(false)
    if (e) return setErr(e)
    setOpen(false); setAmount('')
  }
  async function remove() {
    setBusy(true); setErr('')
    const e = await betting.cancel(game.id)
    setBusy(false)
    if (e) setErr(e)
  }

  if (bet && !open) {
    return (
      <div className={s.bet}>
        <span>
          <i className={s.coin} aria-hidden="true">T</i>
          <b>{bet.stake}</b> on {teamOf(bet.side)} · wins <b className={s.plus}>+{betProfit(bet.stake, probOf(bet.side))}</b>
        </span>
        <span className={s.betBtns}>
          <button type="button" className={s.linkBtn} onClick={() => { setSide(bet.side); setAmount(String(bet.stake)); setOpen(true) }}>Change</button>
          <button type="button" className={s.linkBtn} disabled={busy} onClick={remove}>Cancel bet</button>
        </span>
        {err && <div className={s.error}>{err}</div>}
      </div>
    )
  }

  if (!open) {
    return (
      <div className={s.bet}>
        <button type="button" className={s.linkBtn} onClick={() => { setOpen(true); setSide((game.home_win_prob ?? 0) >= (game.away_win_prob ?? 0) ? 'home' : 'away') }}>
          <i className={s.coin} aria-hidden="true">T</i>Bet tokens on this game
        </button>
      </div>
    )
  }

  const p = probOf(side)
  return (
    <div className={`${s.bet} ${s.betOpen}`}>
      <div className={s.betSides}>
        {(['away', 'home'] as const).map((sd) => (
          <button key={sd} type="button" className={`${s.betSide} ${side === sd ? s.betSideOn : ''}`} onClick={() => setSide(sd)}>
            {teamOf(sd)}
          </button>
        ))}
      </div>
      <div className={s.betRow}>
        <input className={s.input} inputMode="numeric" placeholder={`Tokens (you have ${free.toLocaleString()} free)`}
          value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} aria-label="Tokens to bet" />
        <div className={s.betChips}>
          {[10, 25, 50].filter((n) => n <= free).map((n) => (
            <button key={n} type="button" className={s.chip} onClick={() => setAmount(String(n))}>{n}</button>
          ))}
          <button type="button" className={s.chip} onClick={() => setAmount(String(free))} disabled={free < 1}>Max</button>
        </div>
      </div>
      <div className={s.hint}>
        {valid
          ? <>Win <b className={s.plus}>+{betProfit(stake, p)}</b> if {teamOf(side)} win, lose <b className={s.minus}>−{stake}</b> if they don&apos;t. A tie refunds you.</>
          : amount && stake > free ? <>You only have {free.toLocaleString()} tokens free.</>
          : <>Bets lock at kickoff. The payout comes from the game&apos;s odds.</>}
      </div>
      {err && <div className={s.error}>{err}</div>}
      <div className={s.actions}>
        <button type="button" className={s.primary} disabled={!valid || busy} onClick={submit}>{busy ? 'Placing...' : bet ? 'Update bet' : 'Place bet'}</button>
        <button type="button" className={s.secondary} onClick={() => { setOpen(false); setErr('') }}>Close</button>
      </div>
    </div>
  )
}
