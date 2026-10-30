'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Closes an open menu or panel on a press outside `inside` or on Escape, and
 * puts focus back on its trigger after Escape. Every one of the site's
 * dropdowns needs exactly this; a copy that forgot Escape left a panel that
 * only a pointer could dismiss.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  inside: RefObject<HTMLElement | null>[],
  trigger: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!inside.some(ref => ref.current?.contains(target))) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // A menu inside a dialog closes alone, without the dialog.
      event.stopPropagation()
      close()
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
    // The refs are stable; `close` is read fresh through the effect's own run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
