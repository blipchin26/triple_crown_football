import Link from 'next/link'
import s from './styles'

export default function Tabs({ active }: { active: 'leagues' | 'settings' }) {
  const items = [
    { key: 'leagues', label: 'Leagues', href: '/leagues' },
    { key: 'settings', label: 'Settings', href: '/settings' },
  ] as const

  return (
    <nav className={s.tabs}>
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`${s.tab} ${active === t.key ? s.tabOn : ''}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}