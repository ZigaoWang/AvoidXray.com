'use client'

import { useEffect, useRef, useState } from 'react'

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
  onConfirm: () => void | Promise<void>
  onClose: () => void
  children: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    // The page behind must not scroll while a modal is up.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, busy, onClose])

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="bg-neutral-900 border border-neutral-800 max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-bold text-white mb-2">
          {title}
        </h2>
        <div className="text-neutral-400 text-sm leading-relaxed mb-6">{children}</div>

        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={`px-4 h-9 text-xs uppercase tracking-wide font-bold text-white disabled:opacity-40 ${
              destructive ? 'bg-[#D32F2F] hover:bg-[#B71C1C]' : 'bg-neutral-700 hover:bg-neutral-600'
            }`}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
