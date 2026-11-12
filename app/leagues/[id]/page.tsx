'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useRequireUser } from '../../../lib/useRequireUser'
import Crown from '../../Crown'
import Avatar from '../../Avatar'
import RaceForTripleCrown from './RaceForTripleCrown'
import s from '../../styles'
import { usePageTitle } from '../../../lib/usePageTitle'
import PickBadge, { usePickStatus } from './PickStatus'

type League = {
  id: string; name: string; join_code: string; owner_id: string; members_can_invite: boolean
}
type Member = {
  user_id: string; role: string
  profiles: { username: string; avatar_config: Record<string, unknown> | null } | null
}
type TabKey = 'overview' | 'players' | 'settings'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'players', label: 'Players' },
  { key: 'settings', label: 'Settings' },
]

function LeagueView() {
  const { id } = useParams<{ id: string }>()
  const { counts, week } = usePickStatus(id)
  const router = useRouter()
  const search = useSearchParams()
  const userId = useRequireUser()
  const [league, setLeague] = useState<League | null>(null)
  usePageTitle(league?.name)
  const [members, setMembers] = useState<Member[]>([])
  const [notFound, setNotFound] = useState(false)
  const [who, setWho] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const tabParam = search.get('tab')
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'overview'

  const load = useCallback(async () => {
    if (!userId) return
    const { data: l } = await supabase
      .from('leagues')
      .select('id, name, join_code, owner_id, members_can_invite')
      .eq('id', id).maybeSingle()
    if (!l) { setNotFound(true); return }
    setLeague(l)

    const { data: m } = await supabase
      .from('league_members').select('user_id, role, profiles(username, avatar_config)')
      .eq('league_id', id).order('joined_at')
    setMembers((m ?? []) as unknown as Member[])
  }, [userId, id])

  useEffect(() => { load() }, [load])

  const me = members.find((m) => m.user_id === userId)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const canInvite = isAdmin || !!league?.members_can_invite

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    const { data, error } = await supabase.rpc('invite_to_league', { p_league: id, p_who: who })
    setBusy(false)
    if (error) setError(error.message)
    else { setInfo(data as string); setWho('') }
  }

  async function setInviteSetting(value: boolean) {
    if (!league) return
    setError('')
    const { error } = await supabase.rpc('update_league_settings', {
      p_league: id,
      p_members_can_invite: value,
    })
    if (error) setError(error.message)
    else setLeague({ ...league, members_can_invite: value })
  }

  async function copyLink() {
    if (!league) return
    await navigator.clipboard.writeText(`${window.location.origin}/join/${league.join_code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function leave() {
    if (!userId || !confirm('Leave this league?')) return
    const { error } = await supabase.from('league_members').delete().eq('league_id', id).eq('user_id', userId)
    if (error) setError(error.message)
    else router.push('/leagues')
  }

  async function deleteLeague() {
    if (!league || confirmText.trim().toLowerCase() !== league.name.toLowerCase()) return
    setDeleting(true)
    setError('')
    const { error } = await supabase.rpc('delete_league', { p_league: id })
    if (error) {
      setError(error.message)
      setDeleting(false)
    } else {
      router.replace('/leagues')
    }
  }

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.left}><Link href="/leagues" className={s.back}>← All leagues</Link></div>

        {notFound ? (
          <>
            <h1 className={s.title}>League not found</h1>
            <p className={s.subtitle}>It may not exist, or you may not be a member.</p>
          </>
        ) : !league ? (
          <p className={s.subtitle}>Loading...</p>
        ) : (
          <>
            <div className={s.brand}>
              <Crown className={s.crown} />
              <h1 className={s.title} style={{ margin: 0 }}>{league.name}</h1>
              <div className={s.brandSub}>
                {members.length} {members.length === 1 ? 'player' : 'players'}
              </div>
            </div>

            <nav className={s.tabs}>
              {TABS.map((t) => (
                <Link key={t.key}
                  href={t.key === 'overview' ? `/leagues/${id}` : `/leagues/${id}?tab=${t.key}`}
                  className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`}>
                  {t.label}
                </Link>
              ))}
            </nav>

            {error && <div className={s.error}>{error}</div>}

            {tab === 'overview' && (
              <RaceForTripleCrown leagueId={id} weekHref={(w) => `/leagues/${id}/weeks/${w}`} />
            )}

            {tab === 'players' && (
              <>
                <div className={s.list}>
                  {members.map((m) => (
                    <Link key={m.user_id} href={`/leagues/${id}/players/${m.user_id}`}
                      className={`${s.row} ${m.user_id === userId ? s.rowMe : ''}`}>
                      <span className={s.rowPlayer}>
                        <Avatar config={m.profiles?.avatar_config} size={34} />
                        <span className={s.rowTitle}>
                          {m.profiles?.username ?? 'Unknown'}
                          {m.user_id === userId && <span className={s.youTag}>You</span>}
                          <PickBadge count={counts[m.user_id]} week={week} />
                          {m.role === 'owner' && <Crown className={s.crownSm} />}
                        </span>
                      </span>
                      {m.role !== 'member' && <span className={s.badge}>Admin</span>}
                    </Link>
                  ))}
                </div>
                <p className={s.hint}>Tap a player to see their profile and picks.</p>
              </>
            )}

            {tab === 'settings' && (
              <>
                {canInvite ? (
                  <>
                    <div className={s.sectionTitle} style={{ marginTop: 8 }}>Invite players</div>
                    <form onSubmit={invite} className={s.inline}>
                      <input className={s.input} placeholder="Username or email" value={who}
                        onChange={(e) => setWho(e.target.value)} required />
                      <button className={s.small} disabled={busy}>{busy ? '...' : 'Invite'}</button>
                    </form>
                    {info && <div className={s.notice} style={{ marginTop: 12 }}>{info}</div>}

                    <div className={s.sectionTitle}>Or share a link</div>
                    <div className={s.linkBox}>
                      {typeof window !== 'undefined' ? window.location.origin : ''}/join/{league.join_code}
                    </div>
                    <button className={s.smallGhost} onClick={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
                    <p className={s.hint}>Anyone with this link can join, even if they need to make an account first.</p>
                  </>
                ) : (
                  <p className={s.hint} style={{ marginTop: 8 }}>Only admins can invite players to this league.</p>
                )}

                {isAdmin && (
                  <>
                    <div className={s.sectionTitle}>League options</div>
                    <label className={s.check}>
                      <input type="checkbox" checked={league.members_can_invite}
                        onChange={(e) => setInviteSetting(e.target.checked)} />
                      <div>
                        <div className={s.checkTitle}>Any member can invite</div>
                        <div className={s.checkSub}>Off: only admins can invite players.</div>
                      </div>
                    </label>
                  </>
                )}

                <div className={s.sectionTitle}>Your picks</div>
                <p className={s.hint} style={{ marginTop: 0 }}>
                  Whether this league uses your shared picks is an account setting.{' '}
                  <Link href="/settings" className={s.link}>Open account settings</Link>
                </p>

                {me?.role !== 'owner' && (
                  <div style={{ marginTop: 28 }}>
                    <button className={s.smallGhost} onClick={leave}>Leave league</button>
                  </div>
                )}
                {me?.role === 'owner' && (
                  <>
                    <div className={s.sectionTitle}>Danger zone</div>
                    {!confirming ? (
                      <button className={s.dangerGhost} onClick={() => setConfirming(true)}>Delete league</button>
                    ) : (
                      <div className={s.dangerBox}>
                        <p>
                          This permanently deletes <strong>{league.name}</strong>, including its player list,
                          invites, and everyone&apos;s picks made in this league. It can&apos;t be undone.
                          Type the league name to confirm.
                        </p>
                        <input className={s.input} placeholder={league.name} value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)} />
                        <div className={s.actions}>
                          <button className={s.danger}
                            disabled={deleting || confirmText.trim().toLowerCase() !== league.name.toLowerCase()}
                            onClick={deleteLeague}>
                            {deleting ? 'Deleting...' : 'Delete forever'}
                          </button>
                          <button className={s.smallGhost}
                            onClick={() => { setConfirming(false); setConfirmText('') }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default function LeaguePage() {
  return (
    <Suspense fallback={null}>
      <LeagueView />
    </Suspense>
  )
}
