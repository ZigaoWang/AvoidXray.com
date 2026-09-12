'use client'

import { useEffect, useRef } from 'react'

/**
 * The behavior a dialog has to have, separate from what one looks like.
 *
 * Modal owns the panel that small dialogs share, but several screens need a
 * layout it cannot give them: the moderation review is two columns under a
 * sticky footer, the export dialog is a preview and its controls, the record editor is a
 * generated form. Each grew its own overlay, and each was missing a different
 * piece. Escape did nothing in five of them, the page behind kept scrolling,
 * and focus stayed wherever it was, so opening one with a keyboard put the
 * cursor nowhere and closing it dropped the reader at the top of the document.
 *
 * The look is allowed to differ. This is the part that is not: Escape closes,
 * the page behind does not scroll, focus lands somewhere on open and goes back
 * where it came from on close, and Tab stays inside the panel.
 *
 * `onClose` is held in a ref rather than named as a dependency. Callers pass an
 * inline arrow, so its identity changes on every render of the parent, and an
 * effect keyed on it re-ran mid-interaction: it pulled focus back to the close
 * button while somebody was typing, which is what made confirming a delete
 * from the keyboard bounce off the Cancel button it had just left.
 */
/**
 * The dialogs currently open, innermost last.
 *
 * Only the innermost traps Tab. Without this every open dialog installs its own
 * window listener and they fight: a confirmation opened on top of a panel had
 * both traps firing on one keypress, the outer one pulling focus back into
 * itself while the inner one pushed it to its own first control, which pinned
 * the cursor on whichever button happened to be first and made the rest of the
 * confirmation unreachable.
 */
const openPanels: HTMLElement[] = []

export function useDialogBehavior({
  open,
  onClose,
  initialFocus,
}: {
  open: boolean
  onClose: () => void
  /** Focused on open. Defaults to the panel, which needs tabIndex={-1}. */
  initialFocus?: React.RefObject<HTMLElement | null>
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const initialFocusRef = useRef(initialFocus)

  // Refreshed on every render, and declared before the effect below so it has
  // already run by the time that one opens the dialog.
  useEffect(() => {
    onCloseRef.current = onClose
    initialFocusRef.current = initialFocus
  })

  useEffect(() => {
    if (!open) return

    // Remembered before focus moves, so it can be handed back on close.
    const opener = document.activeElement as HTMLElement | null
    ;(initialFocusRef.current?.current ?? panelRef.current)?.focus()

    const panel = panelRef.current
    if (panel) openPanels.push(panel)

    const onKeyDown = (event: KeyboardEvent) => {
      // Only the innermost dialog answers the keyboard at all.
      //
      // Every open dialog listens on the window, so one Escape reached all of
      // them: dismissing a confirmation stacked on this panel tore the panel
      // down with it, and the two Tab traps fought over one keypress, the outer
      // pulling focus back into itself while the inner pushed it to its own
      // first control.
      if (openPanels[openPanels.length - 1] !== panelRef.current) return

      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      // Tab is kept inside the panel.
      //
      // Every one of these dialogs says aria-modal="true", which tells a screen
      // reader that nothing outside exists — and then Tab walked straight out
      // into the page behind, where the reader was told there was nothing.
      // Announcing a barrier and not having one is worse than neither: the
      // keyboard ends up somewhere the user has been told is not there, with no
      // way back but Escape, which they cannot see either.
      const panel = panelRef.current
      if (!panel) return

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(element => element.offsetWidth > 0 || element.offsetHeight > 0 || element === document.activeElement)

      // A panel with nothing to focus keeps the cursor on itself rather than
      // letting Tab escape to the page behind.
      if (!focusable.length) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (active instanceof Node && !panel.contains(active)) {
        // Focus had already left, so bring it back rather than following it.
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (panel) {
        const at = openPanels.lastIndexOf(panel)
        if (at !== -1) openPanels.splice(at, 1)
      }
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [open])

  return panelRef
}
