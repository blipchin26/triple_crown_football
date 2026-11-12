'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import s from './styles'

// A gold coin and a player's token balance for this season. Put it next to anyone's name.
export default function TokenPill({ userId, refreshKey }: { userId: string | null | undefined; refreshKey?: number }) {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    if (!userId) return
    supabase.rpc('player_tokens', { p_user: userId }).then(({ data }: { data: number | null }) => setN(data ?? 0))
  }, [userId, refreshKey])
  if (n === null) return null
  return (
    <span className={s.tokenPill} title="Tokens this season">
      <i className={s.coin} aria-hidden="true">T</i>{n.toLocaleString()}
    </span>
  )
}
