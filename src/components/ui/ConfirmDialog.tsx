'use client'

import { useRef, useState } from 'react'
import Button from './Button'
import { useDialogBehavior } from './dialog'

/**
 * Confirmation before something that cannot be undone.
 *
 * Destructive actions were split between styled dialogs and the browser's own
 * `confirm()`, so deleting a photo or an album threw up an OS box with the
 * site's domain in the title, no styling, and text that cannot be formatted.
 * It also blocks the main thread and cannot show progress, so a slow delete
 * looked frozen.
 *
 * Focus starts on Cancel rather than the destructive button: a stray Enter on
 * a dialog that just appeared should not delete anything.
 */
export default function ConfirmDialog({
  open,
  title,
  confirmLabel,
  busyLabel,
  destructive = false,
  confirmDisabled = false,
  initialFocus,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  confirmLabel: string
  /** Shown while onConfirm is in flight. Defaults to the confirm label. */
  busyLabel?: string
  destructive?: boolean
  /**
   * Holds the confirm button closed until the body says it may open, for the
   * dialogs that ask for something to be typed back before they will act.
   */
  confirmDisabled?: boolean
  /**
   * What to focus instead of Cancel. Only for a dialog whose body asks for
   * input: putting the cursor in the box is the point, and there is nothing
   * to fire a stray Enter at until it matches.
   */
  initialFocus?: React.RefObject<HTMLElement | null>
  onConfirm: () => void | Promise<void>
  onClose: () => void
  children: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Escape is ignored while the action is in flight: the dialog is the only
  // thing reporting that something is still happening.
  const panelRef = useDialogBehavior({
    open,
    onClose: () => { if (!busy) onClose() },
    initialFocus: initialFocus ?? cancelRef,
  })

  if (!open) return null

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      // The caller usually navigates away; guard anyway so a failed action
      // leaves a usable dialog rather than a permanently spinning one.
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="bg-neutral-900 border border-neutral-800 max-w-md w-full p-6 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-bold text-white mb-2">
          {title}
        </h2>
        <div className="text-neutral-400 text-sm leading-relaxed mb-6">{children}</div>

        {/* The shared button, rather than this dialog's own copy of what a
            button looks like. It had its own height, its own disabled opacity
            and its own non-destructive gray, none of which matched the
            component every other action on the site goes through. */}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={destructive ? 'primary' : 'secondary'}
            onClick={confirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
