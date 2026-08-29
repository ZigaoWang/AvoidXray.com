'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FEEDBACK_STATUSES } from '@/lib/feedback'
import { apiErrorMessage } from '@/lib/apiError'
import Button from '@/components/ui/Button'
import { FieldTextarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

export interface AdminThreadMessage {
  id: string
  body: string
  author: 'SENDER' | 'STAFF'
  sentAt: string
}

export interface AdminFeedback {
  id: string
  reference: string
  kindLabel: string
  message: string
  email: string | null
  username: string | null
  pageUrl: string | null
  userAgent: string | null
  status: string
  messages: AdminThreadMessage[]
  createdAt: string
  /** Set when the sender has asked for an update. */
  nudgedAt: string | null
}

/**
 * One report in the queue, with the answer written inline.
 *
 * The reply box sits next to the message on purpose. Answering is the whole
 * job here, and putting it behind a second click is how a queue quietly turns
 * into a list nobody works through.
 */
export default function FeedbackItem({ item }: { item: AdminFeedback }) {
  const router = useRouter()
  const { toast } = useToast()
  const [status, setStatus] = useState(item.status)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // The reply box starts empty and appends rather than editing in place, so
  // sending the same answer twice is a deliberate act rather than an accident
  // of the field being pre-filled.
  const dirty = status !== item.status || reply.trim().length > 0

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/feedback/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reply: reply.trim() || null }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not save that'), 'error')
        return
      }
      const data = await res.json()
      setReply('')
      // Says plainly whether the reporter was actually told, rather than
      // implying it. A message with no address cannot be answered, which is a
      // normal outcome and should not read as a failure.
      toast(
        data.emailed
          ? `Saved. ${item.email} has been emailed.`
          : item.email
            ? 'Saved, but the email failed to send.'
            : 'Saved. No email address, so nobody was notified.',
        data.emailed || !item.email ? 'success' : 'error'
      )
      router.refresh()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="border border-neutral-800 bg-neutral-900/40">
      <div className="p-4 border-b border-neutral-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div className="flex items-baseline gap-3">
            <a
              href={`/feedback/${item.reference}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-white text-sm hover:text-[#D32F2F] transition-colors"
            >
              {item.reference}
            </a>
            <span className="text-neutral-500 text-xs">{item.kindLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Shown from the column rather than from the email, so a reminder
                whose mail failed is still visible here. */}
            {item.nudgedAt && (
              <span className="text-[#EF5350] text-xs font-medium">
                Reminded {item.nudgedAt}
              </span>
            )}
            <span className="text-neutral-600 text-xs">{item.createdAt}</span>
          </div>
        </div>

        <p className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap">
          {item.message}
        </p>

        {item.messages.length > 0 && (
          <ol className="mt-4 space-y-3">
            {item.messages.map((entry) => {
              const staff = entry.author === 'STAFF'
              return (
                <li
                  key={entry.id}
                  className={`border-l-2 pl-3 ${staff ? 'border-[#D32F2F]' : 'border-neutral-700'}`}
                >
                  <p className="text-[11px] text-neutral-500 mb-0.5">
                    {staff ? 'You' : 'Them'} · {entry.sentAt}
                  </p>
                  <p className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {entry.body}
                  </p>
                </li>
              )
            })}
          </ol>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span>{item.email ? item.email : 'No email address'}</span>
          {item.username && <span>@{item.username}</span>}
          {item.pageUrl && <span className="font-mono">{item.pageUrl}</span>}
          {item.userAgent && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-neutral-400 hover:text-white underline underline-offset-2"
              aria-expanded={expanded}
            >
              {expanded ? 'Hide browser' : 'Browser'}
            </button>
          )}
        </div>
        {expanded && item.userAgent && (
          <p className="mt-2 text-[11px] text-neutral-500 font-mono break-all">{item.userAgent}</p>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_STATUSES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              aria-pressed={status === option.value}
              className={`px-3 h-8 text-xs font-bold uppercase tracking-wide border transition-colors ${
                status === option.value
                  ? 'border-[#D32F2F] bg-[#D32F2F] text-white'
                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor={`reply-${item.id}`} className="sr-only">
            Reply to {item.reference}
          </label>
          <FieldTextarea
            id={`reply-${item.id}`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={
              item.email
                ? 'Emailed to them. They can reply.'
                : 'No email address. This shows on their status page only.'
            }
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={save} disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {dirty && <span className="text-xs text-neutral-500">Unsaved changes</span>}
        </div>
      </div>
    </article>
  )
}
