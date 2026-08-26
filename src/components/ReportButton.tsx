'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { REPORT_REASONS, type ReportTarget } from '@/lib/reports'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from './ui/Toast'

/**
 * Reports a photo, comment, person or note.
 *
 * Deliberately quiet: a small text link rather than a button competing with
 * Like and Comment. Reporting is rare and nobody should be nudged toward it,
 * but when it is needed it has to be findable without hunting.
 */
export default function ReportButton({
  targetType,
  targetId,
  label = 'Report',
  className = '',
}: {
  targetType: ReportTarget
  targetId: string
  label?: string
  className?: string
}) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const firstFieldRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!open) return
    firstFieldRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open])

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
      setOpen(false)
      setReason('')
      setDetail('')
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`text-xs text-neutral-600 hover:text-neutral-300 transition-colors ${className}`}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            className="bg-neutral-900 border border-neutral-800 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-neutral-800">
              <h2 id="report-title" className="text-lg font-bold text-white">Report this {targetType}</h2>
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
                    className="w-full bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm text-white
                               focus:outline-none focus:border-neutral-600"
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
                    className="w-full bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm text-white
                               placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600 resize-y"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={busy}
                    className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !reason}
                    className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-[#D32F2F] text-white
                               hover:bg-[#B71C1C] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {busy ? 'Sending…' : 'Send report'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-6">
                <p className="text-neutral-400 text-sm mb-4">
                  You need an account to report something, so moderators can follow up.
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center h-9 px-4 text-xs uppercase tracking-wide font-bold bg-[#D32F2F] text-white hover:bg-[#B71C1C]"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
