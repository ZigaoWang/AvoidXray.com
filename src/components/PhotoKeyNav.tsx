'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The left and right arrow keys step to the previous and next photo, as they
 * already did inside the lightbox. On the page itself they did nothing, so
 * moving through a roll from the keyboard meant reaching for the links each
 * time.
 *
 * Ignored while typing, with a modifier held, or while any dialog is open,
 * since the lightbox and the menus answer the arrows themselves.
 */
export default function PhotoKeyNav({ prevHref, nextHref }: { prevHref: string | null; nextHref: string | null }) {
  const router = useRouter()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return
      if (document.querySelector('[role="dialog"]')) return
      const href = event.key === 'ArrowLeft' ? prevHref : nextHref
      if (!href) return
      event.preventDefault()
      router.push(href)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [prevHref, nextHref, router])

  return null
}
