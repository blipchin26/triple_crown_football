'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Row = {
  league_id: string; league_name: string
  week: number; user_id: string; username: string; active: boolean
  rank: number | null; tied: boolean; avg_place: number | null
  correct: number; upset_points: number; conf_points: number
  tokens: number; counted: boolean; active_n: number; cap: number; eligible: boolean
  crowns: string[]; my_earned: number; seen: boolean; is_me: boolean
}

function ordinal(n: number) {
  const x = ['th', 'st', 'nd', 'rd']; const v = n % 100
  return n + (x[(v - 20) % 10] || x[v] || x[0])
}

// Weekly summary popup.
//  * <WeekSummaryPopup /> (default export): mount ONCE in app/layout.tsx. It opens itself on whatever screen the player is on
//    the first time they load the app after a week is paid (unless they turned that off in Settings).
//  * <WeekSummaryButton /> (named export): the "Last week summary" button. Put it only on the home page; it reopens the popup.
let available = false
const OPEN = 'tc-open-week-summary'
const READY = 'tc-week-summary-ready'

export function WeekSummaryButton() {
  const [ok, setOk] = useState(available)
  useEffect(() => {
    setOk(available)
    const f = () => setOk(true)
    window.addEventListener(READY, f)
    return () => window.removeEventListener(READY, f)
  }, [])
  if (!ok) return null
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN))}
      style={{
        fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
        border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit',
      }}
    >
      Last week summary
    </button>
  )
}

export default function WeekSummaryPopup() {
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState(false)
  const [leagueId, setLeagueId] = useState<string | null>(null)
  const autoDone = useRef(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [sum, prof] = await Promise.all([
      supabase.rpc('my_week_summary'),
      supabase.from('profiles').select('show_week_summary').eq('id', user.id).maybeSingle(),
    ])
    if (sum.error) return
    const list = (sum.data ?? []) as Row[]
    setRows(list)
    if (list.length === 0) return
    available = true
    window.dispatchEvent(new Event(READY))
    const mineCounted = list.find((r) => r.is_me && r.counted)
    setLeagueId((mineCounted ?? list[0]).league_id)
    const wants = (prof.data as { show_week_summary?: boolean } | null)?.show_week_summary ?? true
    if (!autoDone.current && !list[0].seen && wants) {
      autoDone.current = true
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    load()
    // load again when someone signs in without a page reload
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_IN') load()
    })
    const openIt = () => setOpen(true)
    window.addEventListener(OPEN, openIt)
    return () => {
      sub?.subscription?.unsubscribe()
      window.removeEventListener(OPEN, openIt)
    }
  }, [load])

  function close() {
    setOpen(false)
    if (rows[0]) supabase.rpc('mark_my_week_summary_seen', { p_week: rows[0].week }).then(() => {})
  }

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  if (rows.length === 0) return null

  const week = rows[0].week
  const earned = rows[0].my_earned
  const leagues = Array.from(new Map(rows.map((r) => [r.league_id, r.league_name])).entries())
  const shown = rows.filter((r) => r.league_id === (leagueId ?? rows[0].league_id))
  const mine = shown.find((r) => r.is_me)
  const paidFrom = rows.find((r) => r.is_me && r.counted)
  const crowns = shown[0]?.crowns ?? []
  const showCorrect = crowns.includes('most_correct') || crowns.includes('weekly_wins')
  const showUpset = crowns.includes('upset_points')
  const showConf = crowns.includes('confidence_points')
  const ranked = shown.filter((r) => r.active)
  const inactive = shown.filter((r) => !r.active)

  let headline = 'No tokens this week'
  let sub = 'Nothing was paid.'
  if (earned > 0) {
    headline = `+${earned} tokens`
    sub = leagues.length > 1 && paidFrom ? `from ${paidFrom.league_name}, your best league this week` : 'for your finish this week'
  } else if (rows.filter((r) => r.is_me).every((r) => !r.active)) {
    sub = 'You did not make any picks.'
  } else if (rows.filter((r) => r.is_me).every((r) => !r.eligible)) {
    sub = 'None of your leagues had 4 active players this week.'
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Week ${week} summary`}
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 480,
              maxHeight: '88vh', overflowY: 'auto', padding: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 18 }}>Week {week} results</strong>
              <button type="button" onClick={close} aria-label="Close"
                style={{ border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer', color: 'inherit', lineHeight: 1 }}>×</button>
            </div>

            <div style={{
              margin: '14px 0', padding: '12px 14px', borderRadius: 10, textAlign: 'center',
              background: earned > 0 ? 'rgba(21,128,61,0.10)' : 'rgba(128,128,128,0.10)',
              border: `1px solid ${earned > 0 ? 'rgba(21,128,61,0.35)' : 'rgba(128,128,128,0.3)'}`,
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: earned > 0 ? '#15803d' : 'inherit' }}>{headline}</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>{sub}</div>
            </div>

            {leagues.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {leagues.map(([id, name]) => {
                  const on = id === (leagueId ?? rows[0].league_id)
                  const paid = rows.some((r) => r.league_id === id && r.is_me && r.counted)
                  return (
                    <button key={id} type="button" onClick={() => setLeagueId(id)}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', color: 'inherit',
                        border: `1px solid ${on ? '#2563eb' : 'rgba(128,128,128,0.4)'}`,
                        background: on ? 'rgba(37,99,235,0.10)' : 'transparent',
                      }}>
                      {name}{paid ? ' ★' : ''}
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              {shown[0]?.active_n ?? 0} active player{shown[0]?.active_n === 1 ? '' : 's'}
              {shown[0]?.eligible ? ` · top prize ${shown[0].cap} tokens` : ' · too few for a payout (needs 4)'}
              {mine && mine.counted ? ' · this league paid you' : ''}
            </div>

            {ranked.map((r) => (
              <div key={r.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                background: r.is_me ? 'rgba(37,99,235,0.08)' : 'transparent',
                borderTop: '1px solid rgba(128,128,128,0.18)',
              }}>
                <span style={{ width: 44, fontWeight: 700, fontSize: 13 }}>
                  {r.rank != null ? `${r.tied ? 'T-' : ''}${ordinal(r.rank)}` : ''}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.username}{r.is_me ? ' (you)' : ''}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {[showCorrect && `${r.correct} correct`, showUpset && `${r.upset_points} upset pts`, showConf && `${r.conf_points} conf pts`]
                      .filter(Boolean).join(' · ')}
                    {r.avg_place != null ? ` · avg place ${Number(r.avg_place).toFixed(2)}` : ''}
                  </div>
                </span>
                <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, opacity: r.counted || r.tokens === 0 ? 1 : 0.5 }}>
                  {r.eligible ? `+${r.tokens}` : '–'}
                  {r.tokens > 0 && !r.counted && <div style={{ fontSize: 10, fontWeight: 500 }}>paid elsewhere</div>}
                </span>
              </div>
            ))}

            {inactive.length > 0 && (
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>
                No picks: {inactive.map((r) => r.username).join(', ')}
              </div>
            )}

            <p style={{ fontSize: 11, opacity: 0.65, margin: '14px 0 0' }}>
              Ranked by average weekly place across each league&apos;s crowns (Survival isn&apos;t counted here). Tied players split the
              tokens for the places they share. In more than one league? You&apos;re paid from your best one (★).
            </p>
          </div>
        </div>
      )}
    </>
  )
}