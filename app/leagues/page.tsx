
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useRequireUser } from '../../lib/useRequireUser'
import Crown from '../Crown'
import s from '../styles'
import { usePageTitle } from '../../lib/usePageTitle'

type MyLeague = { id: string; name: string; role: string }
type Invite = { invite_id: string; league_id: string; league_name: string; invited_by_name: string }

const CROWN_OPTIONS = [
  { value: 'most_correct', label: 'Most Correct', description: 'Earn a crown by making the most correct picks.' },
  { value: 'weekly_wins', label: 'Weekly Wins', description: 'Earn a crown for winning individual weeks.' },
  { value: 'upset_points', label: 'Upset Points', description: 'Earn more points for correctly picking underdogs.' },
  { value: 'confidence_points', label: 'Confidence Points', description: 'Assign confidence values to your weekly picks.' },
  { value: 'survival', label: 'Survival', description: 'Pick one team each week and try to keep your survival streak alive.' },
] as const

type CrownOption = typeof CROWN_OPTIONS[number]['value']

const DEFAULT_CROWNS: CrownOption[] = [
  'most_correct',
  'survival',
  'upset_points',
]

export default function LeaguesPage() {
  usePageTitle('Leagues')
  const router = useRouter()
  const userId = useRequireUser()
  const [leagues, setLeagues] = useState<MyLeague[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedCrowns, setSelectedCrowns] = useState<CrownOption[]>(DEFAULT_CROWNS)

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

  function toggleCrown(crown: CrownOption) {
    setSelectedCrowns((current) => {
      if (current.includes(crown)) {
        return current.filter((item) => item !== crown)
      }

      if (current.length >= 3) return current

      return [...current, crown]
    })
  }

  async function createLeague(e: React.FormEvent) {
    e.preventDefault()
    if (creating.current) return

    if (selectedCrowns.length !== 3) {
      setError('Please select exactly three crowns.')
      return
    }

    creating.current = true
    setBusy(true)
    setError('')

    const { data, error } = await supabase.rpc('create_league', {
      p_name: name,
      p_crown_config: selectedCrowns,
    })

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
            <form onSubmit={createLeague}>
              <div className={s.inline}>
                <input
                  className={s.input}
                  placeholder="League name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={40}
                />
                <button className={s.small} disabled={busy || selectedCrowns.length !== 3}>
                  {busy ? '...' : 'Create'}
                </button>
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={s.smallGhost}
                  onClick={() => setAdvancedOpen((open) => !open)}
                  aria-expanded={advancedOpen}
                >
                  {advancedOpen ? '− Hide' : '+ Advanced League Settings'}
                </button>
              </div>

              {advancedOpen && (
                <div style={{
                  marginTop: 14,
                  padding: 16,
                  border: '1px solid rgba(128,128,128,0.3)',
                  borderRadius: 12,
                }}>
                  <div className={s.sectionTitle} style={{ marginTop: 0 }}>
                    Choose your three crowns
                  </div>
                  <p className={s.hint} style={{ marginTop: 0 }}>
                    Select exactly three categories to determine what your league competes for.
                  </p>

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}>
                    {CROWN_OPTIONS.map((option) => {
                      const checked = selectedCrowns.includes(option.value)
                      const disabled = !checked && selectedCrowns.length === 3

                      return (
                        <label
                          key={option.value}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 12,
                            padding: 12,
                            borderRadius: 10,
                            border: checked
                              ? '1px solid var(--foreground, currentColor)'
                              : '1px solid rgba(128,128,128,0.25)',
                            opacity: disabled ? 0.5 : 1,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleCrown(option.value)}
                            style={{ marginTop: 4 }}
                          />
                          <span>
                            <span style={{ display: 'block', fontWeight: 700 }}>
                              {option.label}
                              {checked && (
                                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
                                  Selected
                                </span>
                              )}
                            </span>
                            <span style={{ display: 'block', fontSize: 13, opacity: 0.75, marginTop: 3 }}>
                              {option.description}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>

                  <p className={s.hint} style={{ marginBottom: 0 }}>
                    {selectedCrowns.length} of 3 selected.
                    {selectedCrowns.length === 3
                      ? ' Your crown selection is ready.'
                      : ' Select ' + (3 - selectedCrowns.length) + ' more.'}
                  </p>
                </div>
              )}
            </form>
          </>
        )}
      </div>
    </main>
  )
}
