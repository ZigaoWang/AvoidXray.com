'use client'

import { useState } from 'react'
import { FEEDBACK_REPLY_MAX, FEEDBACK_REPLY_MIN } from '@/lib/feedback'
import { apiErrorMessage } from '@/lib/apiError'
import Button from './ui/Button'
import { FieldTextarea } from './ui/Field'

export interface ThreadMessage {
  id: string
  body: string
  author: 'SENDER' | 'STAFF'
  /** Pre-formatted on the server so both sides render the same date. */
  sentAt: string
}

/**
 * The conversation on a status page, and the box for adding to it.
 *
 * Replaces a read-only page whose only follow-up option was "send another
 * message quoting this reference", which opened a separate thread and left the
 * first one unanswered.
 */
export default function FeedbackThread({
  reference,
  initialMessages,
  canReply,
  nudge,
}: {
  reference: string
  initialMessages: ThreadMessage[]
  canReply: boolean
  /**
   * Null when the thread is not waiting on us. Otherwise `availableIn` is null
   * if a reminder can be sent now, or the wait before one can.
   */
  nudge: { availableIn: string | null } | null
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nudgeState, setNudgeState] = useState<'idle' | 'sending' | 'sent' | 'recorded'>('idle')
  const [nudgeError, setNudgeError] = useState<string | null>(null)

  async function sendNudge() {
    setNudgeState('sending')
    setNudgeError(null)
    try {
      const res = await fetch(`/api/feedback/${reference}/nudge`, { method: 'POST' })
      if (!res.ok) {
        setNudgeError(await apiErrorMessage(res, 'Could not send that reminder.'))
        setNudgeState('idle')
        return
      }
      // The reminder is recorded on the thread whether or not the mail service
      // accepted it, and the queue shows it either way. Saying "sent" when the
      // send failed would be a claim we cannot stand behind.
      const { sent } = await res.json()
      setNudgeState(sent ? 'sent' : 'recorded')
    } catch {
      setNudgeError('Could not reach the server. Please try again.')
      setNudgeState('idle')
    }
  }

  const trimmed = body.trim()
  const canSend = trimmed.length >= FEEDBACK_REPLY_MIN && !busy

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(`/api/feedback/${reference}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      })
      if (!res.ok) {
        setError(await apiErrorMessage(res, 'Could not send that. Please try again.'))
        return
      }
      const created = await res.json()
      // Appended locally rather than reloading, so the reply appears where the
      // reader is already looking.
      setMessages((current) => [
        ...current,
        {
          id: created.id,
          body: created.body,
          author: 'SENDER',
          sentAt: new Date(created.createdAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        },
      ])
      setBody('')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <ol className="space-y-4 mb-8">
        {messages.map((entry) => {
          const staff = entry.author === 'STAFF'
          return (
            <li
              key={entry.id}
              className={`border-l-2 pl-4 py-1 ${
                staff ? 'border-[#D32F2F]' : 'border-neutral-800'
              }`}
            >
              <p className="text-xs text-neutral-500 mb-1">
                <span className={staff ? 'text-neutral-300 font-medium' : ''}>
                  {staff ? 'AvoidXray' : 'You'}
                </span>{' '}
                · {entry.sentAt}
              </p>
              <p className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap">
                {entry.body}
              </p>
            </li>
          )
        })}
      </ol>

      {/* Only shown while the thread is waiting on us, so it cannot be used to
          chase something already answered. */}
      {nudge && (
        <div className="border border-neutral-800 bg-neutral-900/40 px-4 py-3 mb-8">
          {nudgeState === 'sent' ? (
            <p className="text-sm text-neutral-300">Reminder sent. We&apos;ll get back to you.</p>
          ) : nudgeState === 'recorded' ? (
            <p className="text-sm text-neutral-300">
              Reminder recorded. The email did not go out, but this thread is now flagged in our
              queue.
            </p>
          ) : nudge.availableIn ? (
            <p className="text-sm text-neutral-500">
              Waiting for a reply. You can send a reminder {nudge.availableIn}.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={sendNudge}
                disabled={nudgeState === 'sending'}
              >
                {nudgeState === 'sending' ? 'Sending…' : 'Send a reminder'}
              </Button>
              <p className="text-xs text-neutral-500">
                Not heard back? This emails us again.
              </p>
            </div>
          )}
          {nudgeError && (
            <p role="alert" className="mt-2 text-sm text-[#EF5350]">
              {nudgeError}
            </p>
          )}
        </div>
      )}

      {canReply ? (
        <form onSubmit={send} className="border-t border-neutral-900 pt-6">
          <label htmlFor="thread-reply" className="block text-sm text-neutral-400 mb-2">
            Add a reply
          </label>
          <FieldTextarea
            id="thread-reply"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={FEEDBACK_REPLY_MAX}
            placeholder="Write your reply"
          />

          {error && (
            <p
              role="alert"
              className="mt-3 text-sm text-[#EF5350] border border-[#D32F2F]/40 bg-[#D32F2F]/5 px-4 py-3"
            >
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center gap-4">
            <Button type="submit" variant="primary" size="md" disabled={!canSend}>
              {busy ? 'Sending…' : 'Send reply'}
            </Button>
            <p className="text-xs text-neutral-600">We&apos;ll get an email.</p>
          </div>
        </form>
      ) : (
        <p className="border-t border-neutral-900 pt-6 text-sm text-neutral-500">
          This conversation has reached its length limit. Please start a new message.
        </p>
      )}
    </div>
  )
}
