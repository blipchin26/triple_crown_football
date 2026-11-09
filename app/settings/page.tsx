'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useRequireUser } from '../../lib/useRequireUser'
import { TEAMS, TIME_ZONES } from '../../lib/prefs'
import Crown from '../Crown'
import Avatar, { AVATAR_COLORS, AVATAR_EMOJI } from '../Avatar'
import s from '../styles'

type Profile = {
  username: string; avatar_config: { color?: string; emoji?: string } | null
  bio: string | null; favorite_team: string | null; share_picks: boolean
  time_zone: string | null; theme: 'system' | 'light' | 'dark'; remind_picks: boolean
  landing: 'last' | 'list'; username_changed_at: string | null
}
type Flash = { section: string; kind: 'ok' | 'err'; text: string } | null

const changed = () => window.dispatchEvent(new Event('tc-prefs-changed'))

export default function SettingsPage() {
  const router = useRouter()
  const userId = useRequireUser()
  const [p, setP] = useState<Profile | null>(null)
  const [flash, setFlash] = useState<Flash>(null)
  const [busy, setBusy] = useState('')

  // editable drafts
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [team, setTeam] = useState('')
  const [color, setColor] = useState('')
  const [emoji, setEmoji] = useState('')
  const [email, setEmail] = useState('')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [delText, setDelText] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''))
    supabase.from('profiles')
      .select('username, avatar_config, bio, favorite_team, share_picks, time_zone, theme, remind_picks, landing, username_changed_at')
      .eq('id', userId).single()
      .then(({ data }: { data: Profile | null }) => {
        if (!data) return
        setP(data)
        setUsername(data.username)
        setBio(data.bio ?? '')
        setTeam(data.favorite_team ?? '')
        setColor(data.avatar_config?.color ?? '')
        setEmoji(data.avatar_config?.emoji ?? '')
      })
  }, [userId])

  const say = (section: string, kind: 'ok' | 'err', text: string) => setFlash({ section, kind, text })
  const Msg = ({ section }: { section: string }) =>
    flash && flash.section === section
      ? <div className={flash.kind === 'ok' ? s.notice : s.error}>{flash.text}</div> : null

  async function patch(section: string, values: Partial<Profile>, okText?: string) {
    if (!userId) return false
    setBusy(section)
    const { error } = await supabase.from('profiles').update(values).eq('id', userId)
    setBusy('')
    if (error) { say(section, 'err', error.message); return false }
    setP((old) => (old ? { ...old, ...values } : old))
    if (okText) say(section, 'ok', okText)
    changed()
    return true
  }

  async function saveProfile() {
    const ok = await patch('profile', {
      avatar_config: { ...(color && { color }), ...(emoji && { emoji }) },
      bio: bio.trim() || null,
      favorite_team: team || null,
    }, 'Profile saved.')
    return ok
  }

  async function saveUsername() {
    setBusy('username')
    const { error } = await supabase.rpc('change_username', { p_name: username })
    setBusy('')
    if (error) return say('username', 'err', error.message)
    say('username', 'ok', 'Username changed.')
    setP((old) => (old ? { ...old, username: username.trim(), username_changed_at: new Date().toISOString() } : old))
    changed()
  }

  async function saveEmail() {
    setBusy('email')
    const { error } = await supabase.auth.updateUser({ email: email.trim() })
    setBusy('')
    if (error) return say('email', 'err', error.message)
    say('email', 'ok', 'Check your inbox. Open the link we sent to confirm the new address (you may need to confirm from the old one too).')
  }

  async function savePassword() {
    if (newPw.length < 8) return say('password', 'err', 'Use at least 8 characters.')
    if (newPw !== newPw2) return say('password', 'err', 'The new passwords don\'t match.')
    setBusy('password')
    const { data: { user } } = await supabase.auth.getUser()
    const check = await supabase.auth.signInWithPassword({ email: user?.email ?? '', password: curPw })
    if (check.error) { setBusy(''); return say('password', 'err', 'Your current password is incorrect.') }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setBusy('')
    if (error) return say('password', 'err', error.message)
    setCurPw(''); setNewPw(''); setNewPw2('')
    say('password', 'ok', 'Password changed.')
  }

  async function logout(everywhere = false) {
    await supabase.auth.signOut(everywhere ? { scope: 'global' } : undefined)
    router.replace('/')
  }

  async function deleteAccount() {
    setBusy('delete')
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { setBusy(''); return say('delete', 'err', error.message) }
    await supabase.auth.signOut()
    router.replace('/')
  }

  const nextChange = p?.username_changed_at
    ? new Date(new Date(p.username_changed_at).getTime() + 30 * 86400000) : null
  const profileDirty = !!p && (
    (p.avatar_config?.color ?? '') !== color || (p.avatar_config?.emoji ?? '') !== emoji ||
    (p.bio ?? '') !== bio.trim() || (p.favorite_team ?? '') !== team)

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.left}><Link href="/leagues" className={s.back}>← Leagues</Link></div>
        <div className={s.brand}>
          <Crown className={s.crown} />
          <div className={s.brandName}>Profile &amp; settings</div>
        </div>

        {!p ? <p className={s.subtitle}>Loading...</p> : (
          <>
            {/* ---------- Profile ---------- */}
            <div className={s.sectionTitle}>Profile</div>
            <div className={s.profileHead}>
              <Avatar config={{ color, emoji }} name={p.username} size={64} />
              <div>
                <div className={s.profileName}>{p.username}</div>
                {team && <div className={s.profileMeta}>{team} fan</div>}
              </div>
            </div>

            <div className={s.field}>
              <label className={s.label}>Avatar color</label>
              <div className={s.swatches}>
                {AVATAR_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Color ${c}`}
                    className={`${s.swatch} ${color === c ? s.swatchOn : ''}`} style={{ background: c }}
                    onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            <div className={s.field}>
              <label className={s.label}>Avatar icon</label>
              <div className={s.swatches}>
                <button type="button" className={`${s.emojiBtn} ${emoji === '' ? s.swatchOn : ''}`}
                  onClick={() => setEmoji('')}>Aa</button>
                {AVATAR_EMOJI.map((e) => (
                  <button key={e} type="button" className={`${s.emojiBtn} ${emoji === e ? s.swatchOn : ''}`}
                    onClick={() => setEmoji(e)}>{e}</button>
                ))}
              </div>
              <div className={s.hint}>Aa uses your first initial. Shop avatars will go here later.</div>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="bio">Tagline</label>
              <input id="bio" className={s.input} value={bio} maxLength={80}
                placeholder="Chalk is for chumps" onChange={(e) => setBio(e.target.value)} />
              <div className={s.hint}>{bio.length}/80 · shown on your profile page</div>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="team">Favorite team</label>
              <div className={s.selectWrap}>
                <select id="team" className={s.select} value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="">None</option>
                  {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <Msg section="profile" />
            <button className={s.primary} disabled={!profileDirty || busy === 'profile'} onClick={saveProfile}>
              {busy === 'profile' ? 'Saving...' : 'Save profile'}
            </button>

            <div className={s.field} style={{ marginTop: 28 }}>
              <label className={s.label} htmlFor="username">Username</label>
              <input id="username" className={s.input} value={username} maxLength={20}
                autoCapitalize="none" autoCorrect="off" onChange={(e) => setUsername(e.target.value)} />
              <div className={s.hint}>
                3-20 letters, numbers or underscores. You can change it once every 30 days
                {nextChange && nextChange.getTime() > Date.now()
                  ? ` (next change available ${nextChange.toLocaleDateString([], { month: 'short', day: 'numeric' })}).` : '.'}
              </div>
            </div>
            <Msg section="username" />
            <button className={s.secondary} onClick={saveUsername}
              disabled={busy === 'username' || username.trim() === p.username}>
              {busy === 'username' ? 'Changing...' : 'Change username'}
            </button>

            {/* ---------- Picks ---------- */}
            <div className={s.sectionTitle}>Picks</div>
            <label className={s.check}>
              <input type="checkbox" checked={p.share_picks}
                onChange={(e) => patch('picks', { share_picks: e.target.checked })} />
              <div>
                <div className={s.checkTitle}>Make my picks consistent across all leagues</div>
                <div className={s.checkSub}>
                  On: you make one set of picks and every league uses it. Off: you make separate picks
                  in each league. You can switch any time and nothing is deleted. For each game, the
                  setting that was on at kickoff decides which picks count.
                </div>
              </div>
            </label>
            <Msg section="picks" />

            {/* ---------- Preferences ---------- */}
            <div className={s.sectionTitle}>Preferences</div>
            <label className={s.check}>
              <input type="checkbox" checked={p.remind_picks}
                onChange={(e) => patch('prefs', { remind_picks: e.target.checked })} />
              <div>
                <div className={s.checkTitle}>Remind me about unpicked games</div>
                <div className={s.checkSub}>Shows a banner when a game kicks off within 24 hours and you haven&apos;t picked it.</div>
              </div>
            </label>
            <div className={s.field}>
              <label className={s.label} htmlFor="landing">When I open the app</label>
              <div className={s.selectWrap}>
                <select id="landing" className={s.select} value={p.landing}
                  onChange={(e) => patch('prefs', { landing: e.target.value as Profile['landing'] })}>
                  <option value="last">Go to the league I last visited</option>
                  <option value="list">Show my list of leagues</option>
                </select>
              </div>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="tz">Time zone for kickoff times</label>
              <div className={s.selectWrap}>
                <select id="tz" className={s.select} value={p.time_zone ?? ''}
                  onChange={(e) => patch('prefs', { time_zone: e.target.value || null })}>
                  {TIME_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                </select>
              </div>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="theme">Theme</label>
              <div className={s.selectWrap}>
                <select id="theme" className={s.select} value={p.theme}
                  onChange={(e) => patch('prefs', { theme: e.target.value as Profile['theme'] })}>
                  <option value="system">Match my device</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
            <Msg section="prefs" />

            {/* ---------- Account ---------- */}
            <div className={s.sectionTitle}>Account</div>
            <div className={s.field}>
              <label className={s.label} htmlFor="email">Email</label>
              <input id="email" type="email" className={s.input} value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Msg section="email" />
            <button className={s.secondary} onClick={saveEmail} disabled={busy === 'email' || !email.trim()}>
              {busy === 'email' ? 'Sending...' : 'Change email'}
            </button>

            <div className={s.field} style={{ marginTop: 28 }}>
              <label className={s.label} htmlFor="curpw">Change password</label>
              <input id="curpw" className={s.input} type={showPw ? 'text' : 'password'} autoComplete="current-password"
                placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
            </div>
            <div className={s.field}>
              <input className={s.input} type={showPw ? 'text' : 'password'} autoComplete="new-password"
                placeholder="New password (8+ characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div className={s.field}>
              <input className={s.input} type={showPw ? 'text' : 'password'} autoComplete="new-password"
                placeholder="Repeat new password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
              <label className={s.hint} style={{ display: 'block', marginTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show passwords
              </label>
            </div>
            <Msg section="password" />
            <button className={s.secondary} onClick={savePassword} disabled={busy === 'password' || !curPw || !newPw}>
              {busy === 'password' ? 'Changing...' : 'Change password'}
            </button>

            <div className={s.actions} style={{ marginTop: 28 }}>
              <button className={s.secondary} onClick={() => logout()}>Log out</button>
              <button className={s.secondary} onClick={() => logout(true)}>Log out of all devices</button>
            </div>

            <div className={s.sectionTitle}>Delete account</div>
            {!confirmDel ? (
              <button className={s.dangerGhost} onClick={() => setConfirmDel(true)}>Delete my account...</button>
            ) : (
              <div className={s.dangerBox}>
                <p>
                  This permanently deletes your account, your picks and your league memberships. It can&apos;t be
                  undone. If you own a league you&apos;ll need to delete it first. Type your username
                  (<strong>{p.username}</strong>) to confirm.
                </p>
                <input className={s.input} value={delText} placeholder={p.username}
                  onChange={(e) => setDelText(e.target.value)} />
                <Msg section="delete" />
                <div className={s.actions}>
                  <button className={s.danger} disabled={delText !== p.username || busy === 'delete'} onClick={deleteAccount}>
                    {busy === 'delete' ? 'Deleting...' : 'Delete forever'}
                  </button>
                  <button className={s.secondary} onClick={() => { setConfirmDel(false); setDelText('') }}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}