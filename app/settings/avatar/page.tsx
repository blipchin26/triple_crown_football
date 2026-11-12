'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useRequireUser } from '../../../lib/useRequireUser'
import { usePageTitle } from '../../../lib/usePageTitle'
import { RARITY_LABEL, SLOT_TABS, readSlots, type Item, type Slot, type Slots } from '../../../lib/avatar'
import Crown from '../../Crown'
import Avatar from '../../Avatar'
import s from '../../styles'

type Tokens = { balance: number; committed: number; available: number }
type Ledger = { id: number; delta: number; reason: string; ref: string | null; created_at: string }

const REASONS: Record<string, string> = {
  starter: 'Season starter grant', week_correct: 'Weekly Most Correct', week_upset: 'Weekly Upset Points',
  bet_win: 'Bet won', bet_loss: 'Bet lost', purchase: 'Shop purchase',
}
const reasonText = (l: Ledger) => {
  const base = REASONS[l.reason] ?? l.reason
  const m = l.ref?.match(/^(week|game|item):(.+)$/)
  if (!m) return base
  return m[1] === 'week' ? `${base}, week ${m[2]}` : m[1] === 'item' ? `${base}: ${m[2].replace(/_/g, ' ')}` : base
}

export default function AvatarEditorPage() {
  usePageTitle('Avatar')
  const userId = useRequireUser()
  const [items, setItems] = useState<Item[]>([])
  const [owned, setOwned] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Slots>({})
  const [draft, setDraft] = useState<Slots>({})
  const [tokens, setTokens] = useState<Tokens | null>(null)
  const [ledger, setLedger] = useState<Ledger[]>([])
  const [name, setName] = useState('')
  const [tab, setTab] = useState<Slot>('hat')
  const [buying, setBuying] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [showLedger, setShowLedger] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    const [it, ui, tk, lg, pr] = await Promise.all([
      supabase.from('avatar_items').select('*').eq('active', true).order('sort'),
      supabase.from('user_items').select('item_id').eq('user_id', userId),
      supabase.rpc('my_tokens'),
      supabase.from('token_ledger').select('id, delta, reason, ref, created_at').order('id', { ascending: false }).limit(40),
      supabase.from('profiles').select('username, avatar_config').eq('id', userId).single(),
    ])
    setItems((it.data as Item[]) ?? [])
    setOwned(new Set(((ui.data as { item_id: string }[]) ?? []).map((r) => r.item_id)))
    const t = (tk.data as Tokens[] | null)?.[0]
    setTokens(t ?? null)
    setLedger((lg.data as Ledger[]) ?? [])
    setName(pr.data?.username ?? '')
    const { slots } = readSlots(pr.data?.avatar_config)
    setSaved(slots); setDraft(slots)
  }, [userId])
  useEffect(() => { load() }, [load])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const isOwned = (i: Item) => i.starter || owned.has(i.id)
  const tabItems = items.filter((i) => i.slot === tab)
  const unownedWorn = Object.values(draft).map((id) => (id ? byId.get(id) : undefined)).filter((i): i is Item => !!i && !isOwned(i))
  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(clean(saved))

  function clean(sl: Slots) {
    return Object.fromEntries(Object.entries(sl).filter(([, v]) => !!v).sort(([a], [b]) => a.localeCompare(b)))
  }
  const pick = (slot: Slot, id: string | null) =>
    setDraft((d) => { const n = { ...d }; if (id) n[slot] = id; else delete n[slot]; return n })

  async function save() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('save_avatar', { p_slots: clean(draft) })
    setBusy(false)
    if (error) return setMsg({ kind: 'err', text: error.message })
    setSaved(draft); setMsg({ kind: 'ok', text: 'Avatar saved.' })
    window.dispatchEvent(new Event('tc-prefs-changed'))
  }

  async function buy() {
    if (!buying) return
    setBusy(true)
    const { error } = await supabase.rpc('buy_item', { p_item: buying.id })
    setBusy(false)
    if (error) { setMsg({ kind: 'err', text: error.message }); setBuying(null); return }
    const bought = buying
    setBuying(null)
    setMsg({ kind: 'ok', text: `You bought ${bought.name}. Hit Save to wear it.` })
    pick(bought.slot, bought.id)
    await Promise.all([
      supabase.from('user_items').select('item_id').eq('user_id', userId!).then(({ data }: { data: { item_id: string }[] | null }) =>
        setOwned(new Set((data ?? []).map((r) => r.item_id)))),
      supabase.rpc('my_tokens').then(({ data }: { data: Tokens[] | null }) => setTokens(data?.[0] ?? null)),
      supabase.from('token_ledger').select('id, delta, reason, ref, created_at').order('id', { ascending: false }).limit(40)
        .then(({ data }: { data: Ledger[] | null }) => setLedger(data ?? [])),
    ])
  }

  const tabMeta = SLOT_TABS.find((t) => t.slot === tab)!
  const ownedCount = (slot: Slot) => items.filter((i) => i.slot === slot && isOwned(i)).length

  return (
    <main className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.left}><Link href="/settings" className={s.back}>← Settings</Link></div>
        <div className={s.brand}>
          <Crown className={s.crown} />
          <div className={s.brandName}>Avatar &amp; shop</div>
        </div>

        {!tokens ? <p className={s.subtitle}>Loading...</p> : (
          <>
            <div className={s.avEditorTop}>
              <Avatar override={draft} name={name} size={180} shape="card" />
              <div className={s.avBalance}>
                <div className={s.avBalanceNum}><i className={s.coin} aria-hidden="true">T</i>{tokens.available.toLocaleString()}</div>
                <div className={s.hint}>
                  available this season
                  {tokens.committed > 0 && <> · {tokens.committed.toLocaleString()} tied up in open bets</>}
                </div>
                <button type="button" className={s.linkBtn} onClick={() => setShowLedger(!showLedger)}>
                  {showLedger ? 'Hide' : 'Show'} token history
                </button>
              </div>
            </div>

            {showLedger && (
              <ul className={s.ledger}>
                {ledger.length === 0 && <li>Nothing yet.</li>}
                {ledger.map((l) => (
                  <li key={l.id}>
                    <span>{reasonText(l)}</span>
                    <b className={l.delta >= 0 ? s.plus : s.minus}>{l.delta > 0 ? '+' : ''}{l.delta}</b>
                  </li>
                ))}
              </ul>
            )}

            <div className={s.avTabs} role="tablist">
              {SLOT_TABS.map((t) => (
                <button key={t.slot} type="button" role="tab" aria-selected={tab === t.slot}
                  className={`${s.avTab} ${tab === t.slot ? s.avTabOn : ''}`} onClick={() => setTab(t.slot)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className={s.hint} style={{ marginBottom: 10 }}>
              {ownedCount(tab)} of {tabItems.length} owned. Tap anything to try it on; owned items can be worn, others can be bought.
            </div>

            <div className={s.avGrid}>
              {!tabMeta.required && (
                <button type="button" className={`${s.avItem} ${!draft[tab] ? s.avItemOn : ''}`} onClick={() => pick(tab, null)}>
                  <span className={s.avNone}>None</span>
                  <span className={s.avName}>Nothing</span>
                </button>
              )}
              {tabItems.map((i) => {
                const mine = isOwned(i)
                const on = draft[tab] === i.id
                return (
                  <div key={i.id} className={`${s.avItem} ${on ? s.avItemOn : ''} ${s['avR_' + i.rarity] ?? ''}`}>
                    <button type="button" className={s.avPick} onClick={() => pick(tab, i.id)} aria-pressed={on}>
                      <Avatar override={{ ...draft, [tab]: i.id }} size={64} name={i.name} />
                      <span className={s.avName}>{i.name}</span>
                    </button>
                    <div className={s.avMeta}>
                      {mine ? <span className={s.avOwned}>{i.starter ? 'Free' : 'Owned'}</span>
                        : i.season_year ? <span className={s.avExcl}>{i.season_year} exclusive</span>
                        : i.price ? (
                          <button type="button" className={s.avBuy} disabled={i.price > tokens.available}
                            onClick={() => setBuying(i)}>
                            <i className={s.coin} aria-hidden="true">T</i>{i.price.toLocaleString()}
                          </button>
                        ) : <span className={s.avExcl}>Not for sale</span>}
                      <span className={s.avRarity}>{RARITY_LABEL[i.rarity] ?? i.rarity}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {msg && <div className={msg.kind === 'ok' ? s.notice : s.error} style={{ marginTop: 14 }}>{msg.text}</div>}
            {unownedWorn.length > 0 && (
              <div className={s.hint} style={{ marginTop: 10 }}>
                You&apos;re trying on {unownedWorn.map((i) => i.name).join(', ')}. Buy {unownedWorn.length > 1 ? 'them' : 'it'} to wear {unownedWorn.length > 1 ? 'them' : 'it'}.
              </div>
            )}
            <div className={s.actions} style={{ marginTop: 16 }}>
              <button className={s.primary} disabled={!dirty || busy || unownedWorn.length > 0} onClick={save}>
                {busy ? 'Saving...' : 'Save avatar'}
              </button>
              <button className={s.secondary} disabled={!dirty} onClick={() => { setDraft(saved); setMsg(null) }}>
                Undo changes
              </button>
            </div>
          </>
        )}
      </div>

      {buying && (
        <div className={s.modalBack} onClick={() => !busy && setBuying(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={s.modalTitle}>Buy {buying.name}?</div>
            <div className={s.avBuyPreview}>
              <Avatar override={{ ...draft, [buying.slot]: buying.id }} size={96} name={buying.name} />
            </div>
            <div className={s.modalSub}>
              It costs <b>{buying.price?.toLocaleString()}</b> tokens and you have {tokens?.available.toLocaleString()} free.
              You keep it forever, even after tokens reset next season.
            </div>
            <div className={s.actions}>
              <button className={s.primary} disabled={busy} onClick={buy}>{busy ? 'Buying...' : 'Buy it'}</button>
              <button className={s.modalCancel} disabled={busy} onClick={() => setBuying(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}