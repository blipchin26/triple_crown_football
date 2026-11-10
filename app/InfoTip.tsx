'use client'

import { useEffect, useState, type ReactNode } from 'react'

// A small "?" button. Tapping it opens a centered popup that explains something, with a "Got it" button.
// Esc, tapping outside, or "Got it" closes it.
export default function InfoTip({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button type="button" className="tc-info" aria-label={label ?? `About: ${title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}>?</button>
      {open && (
        <div className="tc-modalBack" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          onClick={(e) => e.stopPropagation()}>
          <div className="tc-modal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="tc-modalTitle">{title}</div>
            <div className="tc-infoBody">{children}</div>
            <button className="tc-modalCancel" onClick={() => setOpen(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}