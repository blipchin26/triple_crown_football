import s from './styles'
import { SLOT_ORDER, itemUrl, readSlots, type Slots } from '../lib/avatar'

// A player's little character: transparent layers stacked on a shared canvas.
// Small sizes (<= 64px) zoom in on the head and shoulders so the face is still readable.
// `shape="card"` shows the whole scene in a rounded square instead of a circle (profile page, editor).
// `override` lets the editor show an unsaved look; `bust` forces or disables the zoom.
export default function Avatar({ config, size = 30, name, override, bust, shape = 'circle' }: {
  config?: Record<string, unknown> | null
  size?: number
  name?: string | null
  override?: Slots
  bust?: boolean
  shape?: 'circle' | 'card'
}) {
  const { slots: saved, legacyColor } = readSlots(config)
  const slots = override ?? saved
  const zoom = bust ?? (shape === 'circle' && size <= 64)
  const inner = zoom ? size * 1.54 : size
  const left = zoom ? -size * 0.27 : 0
  const top = zoom ? -size * 0.154 : 0

  return (
    <span className={s.avatar} role="img" aria-label={name ? `${name}'s avatar` : 'Avatar'}
      style={{ width: size, height: size, position: 'relative', display: 'inline-block', overflow: 'hidden',
               borderRadius: shape === 'card' ? Math.round(size * 0.12) : '50%', background: legacyColor ?? '#dfe8dc', flexShrink: 0 }}>
      {SLOT_ORDER.map((slot) => {
        const id = slots[slot]
        if (!id) return null
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={slot} src={itemUrl(slot, id)} alt="" draggable={false}
            style={{ position: 'absolute', left, top, width: inner, height: inner, maxWidth: 'none', pointerEvents: 'none' }} />
        )
      })}
    </span>
  )
}