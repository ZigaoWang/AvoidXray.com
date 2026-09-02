'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { REPORT_REASONS, REPORT_TARGET_NOUNS, type ReportTarget } from '@/lib/reports'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from './ui/Toast'
import Button, { ButtonLink } from './ui/Button'
import { fieldClass } from './ui/Field'

/**
 * The report dialog, opened from an item's overflow menu.
 *
 * Was a component that owned both a text trigger and this dialog. The trigger
 * moved into OverflowMenu so that Report, Block and Delete sit together
 * instead of each adding its own link beside the content.
 */
export default function ReportDialog({
  targetType,
  targetId,
  open,
  onClose,
}: {
  targetType: ReportTarget
  targetId: string
  open: boolean
  onClose: () => void
}) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [reason, setReason] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const firstFieldRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!open) return
    firstFieldRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason) return
    setBusy(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, detail: detail.trim() || null }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not send that report'), 'error')
        return
      }
      const data = await res.json()
      // Re-reporting is not an error worth explaining as one; the outcome the
      // reporter wanted has already happened.
      toast(
        data.alreadyReported
          ? 'You have already reported this. Thank you.'
          : 'Thank you — a moderator will take a look.',
        'success'
      )
      onClose()
      setReason('')
      setDetail('')
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            className="bg-neutral-900 border border-neutral-800 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-neutral-800">
              <h2 id="report-title" className="text-lg font-bold text-white">Report this {REPORT_TARGET_NOUNS[targetType]}</h2>
              <p className="text-neutral-500 text-sm mt-0.5">
                Reports are private. The person you are reporting is not told who filed it.
              </p>
            </div>

            {session ? (
              <form onSubmit={submit} className="p-6 space-y-4">
                <div>
                  <label htmlFor="report-reason" className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    Reason
                  </label>
                  <select
                    id="report-reason"
                    ref={firstFieldRef}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    required
                    className={fieldClass}
                  >
                    <option value="">Choose one…</option>
                    {REPORT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="report-detail" className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    Anything else? <span className="text-neutral-700 normal-case">(optional)</span>
                  </label>
                  <textarea
                    id="report-detail"
                    rows={3}
                    maxLength={1000}
                    value={detail}
                    onChange={e => setDetail(e.target.value)}
                    placeholder="Context that would help a moderator."
                    className={`${fieldClass} resize-y`}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={busy || !reason}>
                    {busy ? 'Sending…' : 'Send report'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="p-6">
                <p className="text-neutral-400 text-sm mb-4">
                  You need an account to report something, so moderators can follow up.
                </p>
                <ButtonLink href="/login" size="sm">
                  Sign in
                </ButtonLink>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
