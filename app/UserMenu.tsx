'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import s from './styles'

export default function UserMenu() {
  const router = useRouter()
  const [name, setName] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<Record<string, unknown> | null>(null)
  const [team, setTeam] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = () => supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('profiles').select('username, avatar_config, favorite_team').eq('id', user.id).single()
      setName(data?.username ?? user.email ?? 'Player')
      setAvatar((data?.avatar_config as Record<string, unknown>) ?? null)
      setTeam(data?.favorite_team ?? null)
    })
    load()
    window.addEventListener('tc-prefs-changed', load)   // settings page fires this after saving
    return () => window.removeEventListener('tc-prefs-changed', load)
  }, [])

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (!name) return <div style={{ height: 42 }} />

  return (
    <div className={s.userWrap} ref={ref}>
      <button className={s.userBtn} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar config={avatar} name={name} />
        <span className={s.userName}>{name}</span>
        {team && <span className={s.teamTag}>{team}</span>}
        <span className={s.caret}>▾</span>
      </button>
      {open && (
        <div className={s.menu} role="menu">
          <div className={s.menuHead}>Signed in as <strong>{name}</strong></div>
          <div className={s.menuSep} />
          <Link href="/settings" className={s.menuItem} role="menuitem" onClick={() => setOpen(false)}>
            Profile &amp; settings
          </Link>
          <button className={`${s.menuItem} ${s.menuDanger}`} role="menuitem" onClick={logout}>Log out</button>
        </div>
      )}
    </div>
  )
}