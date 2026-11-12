'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import s from '../../styles'

export type PickCount = { picked: number; total: number }

// Who has made their picks for this week? (Only yes/no and a count; never WHICH team, that stays hidden until kickoff.)
// Call once near the top of a page (before any early return). `counts[userId]` is undefined until loaded.
export function usePickStatus(leagueId: string | undefined) {
  const [counts, setCounts] = useState<Record<string, PickCount>>({})
  const [week, setWeek] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    if (!leagueId) return
    const { data } = await supabase.rpc('league_week_pick_counts', { p_league: leagueId })
    const m: Record<string, PickCount> = {}
    let w: number | null = null
    for (const r of (data ?? []) as { user_id: string; week: number; picked: number; total: number }[]) {
      m[r.user_id] = { picked: r.picked, total: r.total }
      w = r.week
    }
    setCounts(m); setWeek(w)
  }, [leagueId])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60000)
    const vis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [refresh])

  return { counts, week, refresh }
}

// A small pill: green check when everything is picked, amber with a count when partly, grey when nothing yet.
export default function PickBadge({ count, week }: { count: PickCount | undefined; week?: number | null }) {
  if (!count || count.total === 0) return null
  const { picked, total } = count
  const state = picked >= total ? 'done' : picked === 0 ? 'none' : 'some'
  return (
    <span className={`${s.pickBadge} ${s['pickBadge_' + state]}`}
      title={`Week ${week ?? ''}: ${picked} of ${total} games picked. Their choices stay hidden until each game kicks off.`.replace('Week : ', '')}>
      {state === 'done' ? '✓ Picks in' : state === 'none' ? 'No picks yet' : `${picked}/${total} picked`}
    </span>
  )
}