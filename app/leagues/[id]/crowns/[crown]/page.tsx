'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../../lib/supabase'
import { useRequireUser } from '../../../../../lib/useRequireUser'
import Crown from '../../../../Crown'
import InfoTip from '../../../../InfoTip'
import s from '../../../../styles'
import { CROWN_PAGES, type CrownRow, type Metric } from '../config'

const NUM_FIELDS = ['correct', 'total', 'weekly_wins', 'upset_points', 'best_week', 'second_week', 'third_week',
  'longest_streak', 'first_places', 'second_places', 'third_places', 'fourth_places', 'underdog_hits',
  'rank_correct', 'rank_weekly', 'rank_upset', 'avg_place', 'firsts', 'best_place', 'rank_overall'] as const

function clean(r: Record<string, unknown>): CrownRow {
  const o = { ...r } as Record<string, unknown>
  for (const k of NUM_FIELDS) o[k] = Number(o[k] ?? 0)
  o.best_bet = r.best_bet == null ? null : Number(r.best_bet)
  o.avg_prob = r.avg_prob == null ? null : Number(r.avg_prob)
  o.hist = ((r.hist ?? []) as unknown[]).map(Number)
  return o as unknown as CrownRow
}

function ordinal(n: number) {
  const x = ['th', 'st', 'nd', 'rd']; const v = n % 100
  return n + (x[(v - 20) % 10] || x[v] || x[0])
}

// the first tiebreaker where two players differ (in the order they are applied), or null
function deciding(a: CrownRow, b: CrownRow, breakers: Metric[]): Metric | null {
  for (const m of breakers) if (m.get(a) !== m.get(b)) return m
  return null
}

function CrownView() {
  const [rulesOpen, setRulesOpen] = useState(false)
  const { id, crown } = useParams<{ id: string; crown: string }>()
  const userId = useRequireUser()
  const page = CROWN_PAGES.find((p) => p.slug === crown)
  const [rows, setRows] = useState<CrownRow[] | null>(null)
  const [leagueName, setLeagueName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase.from('leagues').select('name').eq('id', id).maybeSingle()
      .then(({ data }: { data: { name: string } | null }) => setLeagueName(data?.name ?? ''))
    const load = async () => {
      const { data, error } = await supabase.rpc('league_crown_details', { p_league: id })
      if (error) return setError(error.message)
      setRows(((data ?? []) as Record<string, unknown>[]).map(clean))
    }
    load()
    const t = setInterval(load, 60_000)            // standings move as games finish
    return () => clearInterval(t)
  }, [userId, id])

  useEffect(() => {
    if (page) document.title = `Triple Crown Football - ${leagueName ? leagueName + ' - ' : ''}${page.title}`
  }, [page, leagueName])

  if (!page) {
    return (
      <main className={s.page}><div className={`${s.card} ${s.cardWide}`}>
        <h1 className={s.title}>Page not found</h1>
        <Link href={`/leagues/${id}`} className={s.back}>← Back to the league</Link>
      </div></main>
    )
  }

  const rk = (r: CrownRow) => Number(r[page.rankKey])
  const tied = (r: CrownRow) => Boolean(r[page.tieKey])
  const sorted = rows ? [...rows].sort((a, b) => rk(a) - rk(b) || a.username.localeCompare(b.username)) : []
  const started = sorted.some((r) => r.total > 0 || r.correct > 0)
  const mainEq = (a: CrownRow, b: CrownRow) => page.main.get(a) === page.main.get(b)

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.left}><Link href={`/leagues/${id}`} className={s.back}>← {leagueName || 'League'}</Link></div>

        <nav className="tc-cwTabs" aria-label="Crowns">
          {CROWN_PAGES.map((p) => (
            <Link key={p.slug} href={`/leagues/${id}/crowns/${p.slug}`}
              className={`tc-cwTab ${p.slug === page.slug ? 'tc-cwTabOn' : ''}`}>{p.nav}</Link>
          ))}
        </nav>

        <div className="tc-cwHead">
          <Crown className="tc-cwCrown" />
          <div>
            <h1 className="tc-cwTitle">
              {page.title}
              <InfoTip title={`How ${page.title} is decided`}>
                <p>{page.blurb}</p>
                <ol className="tc-cwRules">
                  <li><strong>{page.main.label}.</strong> {page.main.help}</li>
                  {page.breakers.map((m) => <li key={m.label}><strong>{m.label}.</strong> {m.help}</li>)}
                  <li><strong>Coin flip.</strong> {page.lastResort}</li>
                </ol>
              </InfoTip>
            </h1>
            <div className="tc-cwBlurb">{page.blurb}</div>
          </div>
        </div>

        <details className="tc-cwRulesBox" open={rulesOpen} onToggle={(e) => setRulesOpen(e.currentTarget.open)}>
          <summary>How ties are broken</summary>
          <ol>
            <li><strong>{page.main.label}</strong> is compared first.</li>
            {page.breakers.map((m) => (
              <li key={m.label}><strong>{m.label}</strong>{m.low ? ' (lower wins)' : ''}: {m.help}</li>
            ))}
            <li><strong>Coin flip</strong>: {page.lastResort}</li>
          </ol>
        </details>

        {error && <div className={s.error}>{error}</div>}
        {!rows && !error && <p className={s.subtitle}>Loading...</p>}

        {rows && !started && (
          <div className="tc-cmpHint">Standings appear once the first games are final.</div>
        )}

        {rows && started && (
          <div className="tc-cwList">
            {sorted.map((r, i) => {
              const prev = i > 0 ? sorted[i - 1] : null
              let note = ''
              let hitKey: string | null = null
              if (prev && rk(r) === rk(prev) && tied(r)) {
                note = 'Tied on every tiebreaker. A coin flip settles it at the end of the season.'
              } else if (prev && rk(r) > rk(prev) && mainEq(r, prev)) {
                const m = deciding(r, prev, page.breakers)
                if (m) { hitKey = m.label; note = `Same ${page.main.label.toLowerCase()} as ${prev.username}. ${prev.username} is ahead on ${m.label.toLowerCase()} (${m.fmt(prev)} vs ${m.fmt(r)}).` }
                else note = `Same ${page.main.label.toLowerCase()} as ${prev.username}. Decided by lower weekly finishes.`
              } else if (!prev && tied(r)) {
                note = 'Tied on every tiebreaker. A coin flip settles it at the end of the season.'
              }
              const place = `${tied(r) ? 'T-' : ''}${ordinal(rk(r))}`
              const medal = rk(r) === 1 ? 'tc-cwGold' : rk(r) === 2 ? 'tc-cwSilver' : rk(r) === 3 ? 'tc-cwBronze' : ''
              return (
                <div key={r.user_id} className={`tc-cwCard ${r.user_id === userId ? 'tc-cwMe' : ''}`}>
                  <div className="tc-cwTop">
                    <span className={`tc-cwRank ${medal}`}>{place}</span>
                    <span className="tc-cwName">{r.username}{r.user_id === userId && <span className={s.youTag}>You</span>}</span>
                    <span className="tc-cwMain">
                      <span className="tc-cwMainVal">{page.main.fmt(r)}</span>
                      <span className="tc-cwMainLbl">{page.main.label}</span>
                    </span>
                  </div>
                  <div className="tc-cwChips">
                    {page.breakers.map((m, k) => (
                      <div key={m.label} className={`tc-cwChip ${hitKey === m.label ? 'tc-cwChipHit' : ''}`}>
                        <span className="tc-cwChipLbl"><i className="tc-cwNum">{k + 1}</i>{m.label}
                          <InfoTip title={m.label}><p>{m.help}</p></InfoTip>
                        </span>
                        <span className="tc-cwChipVal">{m.fmt(r)}</span>
                      </div>
                    ))}
                    {page.extras?.map((m) => (
                      <div key={m.label} className="tc-cwChip tc-cwChipExtra">
                        <span className="tc-cwChipLbl">{m.label}</span>
                        <span className="tc-cwChipVal">{m.fmt(r)}</span>
                      </div>
                    ))}
                  </div>
                  {note && <div className="tc-cwNote">{note}</div>}
                </div>
              )
            })}
          </div>
        )}

        {rows && started && (
          <p className={s.hint}>
            Numbers on the chips are in tiebreak order. Standings update as games finish. Players shown as
            tied (T-) are level on every tiebreaker.
          </p>
        )}
      </div>
    </main>
  )
}

export default function CrownPageWrapper() {
  return (
    <Suspense fallback={null}>
      <CrownView />
    </Suspense>
  )
}