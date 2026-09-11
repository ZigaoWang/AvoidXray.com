'use client'

import { useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { REPORT_REASONS, REPORT_TARGET_NOUNS, type ReportTarget } from '@/lib/reportTypes'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from './ui/Toast'
import Button, { ButtonLink } from './ui/Button'
import { fieldClass, fieldClassMultiline, FieldHint } from './ui/Field'
import FieldLabel from './ui/FieldLabel'
import Modal from './ui/Modal'

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
          : 'Thank you. A moderator will take a look.',
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Report this ${REPORT_TARGET_NOUNS[targetType]}`}
      description="Reports are private. The person you are reporting is not told who filed it."
      // The reason is the whole report, so the cursor starts in it rather than
      // on the close button.
      initialFocus={firstFieldRef}
    >
      {session ? (
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <FieldLabel htmlFor="report-reason" required>Reason</FieldLabel>
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
            <FieldLabel htmlFor="report-detail" hint="(optional)">Anything else?</FieldLabel>
            <textarea
              id="report-detail"
              rows={3}
              maxLength={1000}
              value={detail}
              onChange={e => setDetail(e.target.value)}
              className={`${fieldClassMultiline} resize-y`}
            />
            {/* A hint rather than a placeholder: the one piece of guidance
                here used to vanish the moment somebody started typing. */}
            <FieldHint>Context that would help a moderator.</FieldHint>
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
    </Modal>
  )
}
