'use client'

import { useEffect } from 'react'

const SITE = 'Triple Crown Football'

// usePageTitle('Login')       -> "Triple Crown Football - Login"
// usePageTitle(undefined)     -> "Triple Crown Football"   (also used while a name is still loading)
export function usePageTitle(page?: string | null) {
  useEffect(() => {
    document.title = page ? `${SITE} - ${page}` : SITE
  }, [page])
}