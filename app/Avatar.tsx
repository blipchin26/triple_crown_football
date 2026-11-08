import s from './styles'

// Placeholder avatar: an empty circle for now.
// Later this renders the player's customized avatar from `config` (profiles.avatar_config), so every
// place that shows a player's picture (menu, player lists, standings) only needs this one file to change.
export default function Avatar({ config, size = 30 }: { config?: Record<string, unknown> | null; size?: number }) {
  void config
  return <span className={s.avatar} style={{ width: size, height: size }} aria-hidden="true" />
}
