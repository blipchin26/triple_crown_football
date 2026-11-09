'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import s from './styles'

type Prefs = {
  theme: 'system' | 'light' | 'dark'; time_zone: string | null; remind_picks: boolean
  landing: 'last' | 'list'; last_league_id: string | null; share_picks: boolean
}
type Reminder = { count: number; week: number; leagueId: string }

const LEAGUE_PATH = /^\/leagues\/([0-9a-fA-F-]{36})/
const get = (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }
const set = (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* ignore */ } }

// Mounted once in the top bar. Applies theme and time zone, lands you in your last league, remembers
// which league you visited, and shows the "you have unpicked games" banner. Settings changes apply
// instantly because the settings page fires a "tc-prefs-changed" event.
export default function PrefsApplier({ userId }: { userId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [reminder, setReminder] = useState<Reminder | null>(null)
  const [hidden, setHidden] = useState(false)

  const loadPrefs = useCallback(async () => {
    const { data } = await supabase.from('profiles')
      .select('theme, time_zone, remind_picks, landing, last_league_id, share_picks')
      .eq('id', userId).maybeSingle()
    if (data) setPrefs(data as Prefs)
  }, [userId])

  useEffect(() => {
    loadPrefs()
    window.addEventListener('tc-prefs-changed', loadPrefs)
    return () => window.removeEventListener('tc-prefs-changed', loadPrefs)
  }, [loadPrefs])

  // theme: dark mode inverts the page colors (images are flipped back in the CSS)
  useEffect(() => {
    if (!prefs) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && mq.matches)
      document.documentElement.setAttribute('data-tc-theme', dark ? 'dark' : 'light')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [prefs?.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  // time zone, read by fmtKickoff() in lib/prefs.ts
  useEffect(() => {
    if (!prefs) return
    try {
      if (prefs.time_zone) localStorage.setItem('tc_tz', prefs.time_zone)
      else localStorage.removeItem('tc_tz')
    } catch { /* ignore */ }
  }, [prefs?.time_zone]) // eslint-disable-line react-hooks/exhaustive-deps

  // on the first page of a browser session, land in the league you last visited
  useEffect(() => {
    if (!prefs || get('tc_landed')) return
    set('tc_landed', '1')
    if (pathname !== '/leagues' || prefs.landing !== 'last' || !prefs.last_league_id) return
    supabase.from('league_members').select('league_id')
      .eq('league_id', prefs.last_league_id).eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data) router.replace(`/leagues/${prefs.last_league_id}`) })
  }, [prefs, pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // remember the league you're looking at
  const pathLeague = pathname?.match(LEAGUE_PATH)?.[1] ?? null
  useEffect(() => {
    if (!pathLeague || get('tc_last') === pathLeague) return
    set('tc_last', pathLeague)
    supabase.from('profiles').update({ last_league_id: pathLeague }).eq('id', userId).then(() => {})
  }, [pathLeague, userId])

  // pick reminder: games kicking off within 24 hours that you haven't picked
  const leagueForReminder = pathLeague ?? prefs?.last_league_id ?? null
  const check = useCallback(async () => {
    if (!prefs?.remind_picks || !leagueForReminder) { setReminder(null); return }
    const now = new Date()
    const { data: games } = await supabase.from('games').select('id, week')
      .gt('kickoff_at', now.toISOString())
      .lt('kickoff_at', new Date(now.getTime() + 24 * 3600 * 1000).toISOString())
      .order('kickoff_at')
    if (!games?.length) { setReminder(null); return }
    const { data: picks } = await supabase.from('picks').select('game_id, league_id')
      .eq('user_id', userId).in('game_id', games.map((g: { id: number }) => g.id))
    const done = new Set(
      (picks ?? [])
        .filter((p: { league_id: string | null }) =>
          prefs.share_picks ? p.league_id === null : p.league_id === leagueForReminder)
        .map((p: { game_id: number }) => p.game_id))
    const missing = games.filter((g: { id: number }) => !done.has(g.id))
    setReminder(missing.length ? { count: missing.length, week: missing[0].week, leagueId: leagueForReminder } : null)
  }, [prefs?.remind_picks, prefs?.share_picks, leagueForReminder, userId])

  useEffect(() => {
    check()
    const t = setInterval(check, 5 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [check, pathname])

  const dismissKey = reminder ? `tc_dismiss:${reminder.leagueId}:${reminder.week}:${reminder.count}` : ''
  useEffect(() => { setHidden(dismissKey ? get(dismissKey) === '1' : false) }, [dismissKey])

  if (!reminder || hidden || pathname?.includes(`/weeks/${reminder.week}`)) return null
  return (
    <div className={s.remind} role="status">
      <span>
        {reminder.count === 1 ? '1 game kicks off' : `${reminder.count} games kick off`} within 24 hours
        and you haven&apos;t picked {reminder.count === 1 ? 'it' : 'them'} yet.
      </span>
      <Link href={`/leagues/${reminder.leagueId}/weeks/${reminder.week}`} className={s.remindLink}>Make picks</Link>
      <button className={s.remindX} aria-label="Dismiss" onClick={() => { set(dismissKey, '1'); setHidden(true) }}>×</button>
    </div>
  )
}