const KEY = 'tc_next'

export function rememberNext(path: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ path, t: Date.now() })) } catch {}
}

export function clearNext() {
  try { localStorage.removeItem(KEY) } catch {}
}

export function goAfterAuth(router: { replace: (path: string) => void }) {
  let dest = '/leagues'
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const { path, t } = JSON.parse(raw)
      const fresh = Date.now() - t < 30 * 60 * 1000
      if (fresh && typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) dest = path
    }
  } catch {}
  router.replace(dest)
}