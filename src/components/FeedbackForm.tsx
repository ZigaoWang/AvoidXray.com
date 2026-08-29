'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  feedbackKindPlaceholder,
} from '@/lib/feedback'
import { apiErrorMessage } from '@/lib/apiError'
import Button, { ButtonLink } from './ui/Button'
import { FieldInput, FieldTextarea } from './ui/Field'

/**
 * The feedback form: four chips, a box, an optional address.
 *
 * An earlier version explained every choice and field in prose, which made a
 * two-field form look like paperwork. Anything that still needs saying is one
 * line, and the rest is left to the labels.
 */
export default function FeedbackForm() {
  const { data: session, status: sessionStatus } = useSession()
  const [kind, setKind] = useState<string>('BUG')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  /** Honeypot. Never shown to a person; see the input at the end of the form. */
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [page, setPage] = useState<string | null>(null)

  const signedIn = sessionStatus === 'authenticated'
  const accountEmail = (session?.user as { email?: string } | undefined)?.email ?? null

  // Read after mount: document.referrer does not exist on the server, and
  // reading it during render would disagree with the HTML that was sent.
  useEffect(() => {
    const referrer = document.referrer
    setPage(referrer.startsWith(window.location.origin) ? new URL(referrer).pathname : null)
  }, [])

  const trimmed = message.trim()
  const needed = FEEDBACK_MESSAGE_MIN - trimmed.length
  // A signed-out sender must leave an address, since there is otherwise no way
  // to answer them. The browser enforces this too, but the button reflects it
  // so it is obvious why Send is unavailable.
  const hasEmail = signedIn || email.trim().length > 0
  const canSend = needed <= 0 && hasEmail && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          message: trimmed,
          email: email.trim() || null,
          pageUrl: page,
          website,
        }),
      })
      if (!res.ok) {
        setError(await apiErrorMessage(res, 'Could not send that. Please try again.'))
        return
      }
      setReference((await res.json()).reference)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (reference) {
    const willEmail = signedIn ? accountEmail : email.trim()
    return (
      <div className="border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-white text-xl font-bold mb-4">Sent</h2>

        <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Reference</p>
        <p className="text-white text-2xl font-bold font-mono tracking-tight mb-4">{reference}</p>

        <p className="text-neutral-400 text-sm leading-relaxed mb-6">
          We&apos;ll email {willEmail} when the status changes.
        </p>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/feedback/${reference}`} variant="primary" size="md">
            View status
          </ButtonLink>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setReference(null)
              setMessage('')
              setKind('BUG')
            }}
          >
            Send another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="sr-only">What kind of message is this?</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_KINDS.map((option) => {
            const selected = kind === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                aria-pressed={selected}
                className={`px-4 h-9 text-sm font-medium border transition-colors ${
                  selected
                    ? 'border-[#D32F2F] bg-[#D32F2F] text-white'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="feedback-message" className="sr-only">
          Your message
        </label>
        <FieldTextarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={FEEDBACK_MESSAGE_MAX}
          required
          aria-describedby="feedback-count"
          placeholder={feedbackKindPlaceholder(kind)}
        />
        {/* Says what is still missing rather than only that Send is disabled.
            aria-live so it is announced as it changes, polite so it does not
            interrupt every keystroke. */}
        <p
          id="feedback-count"
          aria-live="polite"
          className="mt-2 text-xs text-right text-neutral-600 tabular-nums"
        >
          {needed > 0
            ? `${needed} more character${needed === 1 ? '' : 's'} to send`
            : `${trimmed.length.toLocaleString('en-US')} / ${FEEDBACK_MESSAGE_MAX.toLocaleString('en-US')}`}
        </p>
      </div>

      <div>
        <label htmlFor="feedback-email" className="block text-sm text-neutral-400 mb-2">
          {signedIn ? (
            <>Replies go to {accountEmail}</>
          ) : (
            <>
              Email <span className="text-neutral-600">(so we can reply)</span>
            </>
          )}
        </label>
        {!signedIn && (
          <FieldInput
            id="feedback-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        )}
      </div>

      {/* Off-screen and hidden from assistive technology: a person never
          encounters this, a form-filling bot completes it, and the server
          answers those with a plausible success rather than an error. */}
      <div aria-hidden className="absolute left-[-9999px] w-px h-px overflow-hidden">
        <label htmlFor="website-url">Leave this field empty</label>
        <input
          id="website-url"
          name="website-url"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[#EF5350] border border-[#D32F2F]/40 bg-[#D32F2F]/5 px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
        <Button type="submit" variant="primary" size="lg" disabled={!canSend}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
        {/* One line rather than a panel. The request does carry the page and
            the browser string, so it has to be stated, but it is a footnote. */}
        <p className="text-xs text-neutral-600">Your browser and current page are included.</p>
      </div>
    </form>
  )
}
