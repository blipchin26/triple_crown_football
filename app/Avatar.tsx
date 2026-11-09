import s from './styles'

export const AVATAR_COLORS = ['#e4eae2', '#f6c9c9', '#f9dcb4', '#f6ecaa', '#cdeccb', '#bfe6e6', '#c4d7f5', '#d9cdf3', '#f3c9e4']
export const AVATAR_EMOJI = ['🏈', '👑', '🔥', '⚡', '🐐', '🎯', '🧠', '🦅', '🐻', '🐬', '🦁', '🐯', '🎩', '🚀', '💎', '🍀']

// A player's picture: a colored circle with an emoji, or their initial if they haven't chosen an emoji.
// Every place that shows a player uses this one component, so shop avatars can replace it later.
export default function Avatar({ config, size = 30, name }: {
  config?: Record<string, unknown> | null; size?: number; name?: string | null
}) {
  const color = typeof config?.color === 'string' ? config.color : undefined
  const emoji = typeof config?.emoji === 'string' ? config.emoji : ''
  const label = emoji || (color && name ? name.trim().charAt(0).toUpperCase() : '')
  return (
    <span className={s.avatar} aria-hidden="true"
      style={{ width: size, height: size, background: color, fontSize: size * 0.52, lineHeight: `${size - 3}px`,
               textAlign: 'center', fontWeight: 800, color: '#0f1a14', overflow: 'hidden' }}>
      {label}
    </span>
  )
}