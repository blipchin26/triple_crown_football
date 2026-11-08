'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useRequireUser } from '../../lib/useRequireUser'
import Crown from '../Crown'
import s from '../styles'

type MyLeague = { id: string; name: string; role: string }
type Invite = { invite_id: string; league_id: string; league_name: string; invited_by_name: string }

export default function LeaguesPage() {
  const router = useRouter()
  const userId = useRequireUser()
  const [leagues, setLeagues] = useState<MyLeague[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    const [m, i] = await Promise.all([
      supabase.from('league_members').select('role, leagues(id, name)').eq('user_id', userId),
      supabase.rpc('my_pending_invites'),
    ])
    const rows = (m.data ?? []) as unknown as { role: string; leagues: { id: string; name: string } | null }[]
    setLeagues(rows.filter((r) => r.leagues).map((r) => ({ id: r.leagues!.id, name: r.leagues!.name, role: r.role })))
    setInvites((i.data ?? []) as Invite[])
    setLoaded(true)
  }, [userId])

  useEffect(() => { load() }, [load])

  const creating = useRef(false)

  async function createLeague(e: React.FormEvent) {
    e.preventDefault()
    if (creating.current) return
    creating.current = true
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_league', { p_name: name })
    if (error) {
      setError(error.message)
      setBusy(false)
      creating.current = false
    } else {
      router.push(`/leagues/${data}`)
    }
  }

  async function respond(inviteId: string, accept: boolean) {
    setError('')
    const { data, error } = await supabase.rpc('respond_to_invite', { p_invite: inviteId, p_accept: accept })
    if (error) setError(error.message)
    else if (accept) router.push(`/leagues/${data}`)
    else load()
  }

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.brand}>
          <Crown className={s.crown} />
          <div className={s.brandName}>Your leagues</div>
        </div>

        {!loaded ? (
          <p className={s.subtitle}>Loading...</p>
        ) : (
          <>
            {error && <div className={s.error}>{error}</div>}

            {invites.length > 0 && (
              <>
                <div className={s.sectionTitle}>Invitations</div>
                <div className={s.list}>
                  {invites.map((inv) => (
                    <div key={inv.invite_id} className={s.row}>
                      <div>
                        <div className={s.rowTitle}>{inv.league_name}</div>
                        <div className={s.rowSub}>Invited by {inv.invited_by_name}</div>
                      </div>
                      <div className={s.actions}>
                        <button className={s.small} onClick={() => respond(inv.invite_id, true)}>Accept</button>
                        <button className={s.smallGhost} onClick={() => respond(inv.invite_id, false)}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className={s.sectionTitle}>My leagues</div>
            {leagues.length === 0 ? (
              <p className={s.hint}>You&apos;re not in a league yet. Create one below or accept an invitation.</p>
            ) : (
              <div className={s.list}>
                {leagues.map((l) => (
                  <Link key={l.id} href={`/leagues/${l.id}`} className={s.row}>
                    <span className={s.rowTitle}>{l.name}</span>
                    {l.role !== 'member' && <span className={s.badge}>Admin</span>}
                  </Link>
                ))}
              </div>
            )}

            <div className={s.sectionTitle}>Create a league</div>
            <form onSubmit={createLeague} className={s.inline}>
              <input className={s.input} placeholder="League name" value={name}
                onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} />
              <button className={s.small} disabled={busy}>{busy ? '...' : 'Create'}</button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}