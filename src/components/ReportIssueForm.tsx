'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { FEEDBACK_KINDS, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN } from '@/lib/feedback'
import { apiErrorMessage } from '@/lib/apiError'
import Button, { ButtonLink } from './ui/Button'
import { FieldInput, FieldTextarea } from './ui/Field'

/**
 * The site's report form.
 *
 * Written against one complaint: forms you submit into silence. Three things
 * answer it, and each is load-bearing rather than decoration.
 *
 *   - It asks for as little as possible. One choice and one box. The browser
 *     and the page you were on are attached automatically, and shown to you,
 *     so nobody has to describe their own setup to report a broken button.
 *   - It does not require an account. Someone who cannot register is precisely
 *     the person who most needs to be able to say so.
 *   - It hands back a reference and a link, and promises an email. That
 *     promise is kept by the admin queue, which cannot change a status without
 *     attempting to tell the reporter.
 */
export default function ReportIssueForm() {
  const { data: session, status: sessionStatus } = useSession()
  const [kind, setKind] = useState<string>('BUG')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  /** Honeypot. Never shown to a person; see the input at the end of the form. */
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [context, setContext] = useState<{ page: string; browser: string } | null>(null)

  const signedIn = sessionStatus === 'authenticated'
  const accountEmail = (session?.user as { email?: string } | undefined)?.email ?? null

  // Read after mount: `document.referrer` and the user agent do not exist on
  // the server, and reading them during render would disagree with the HTML
  // that was sent.
  useEffect(() => {
    const referrer = document.referrer
    const sameSite = referrer.startsWith(window.location.origin)
    setContext({
      page: sameSite ? new URL(referrer).pathname : 'Not sure — came here directly',
      browser: navigator.userAgent,
    })
  }, [])

  const trimmed = message.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < FEEDBACK_MESSAGE_MIN
  const remaining = FEEDBACK_MESSAGE_MAX - trimmed.length
  const canSend = trimmed.length >= FEEDBACK_MESSAGE_MIN && !busy

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
          pageUrl: context?.page ?? null,
          website,
        }),
      })
      if (!res.ok) {
        setError(await apiErrorMessage(res, 'Could not send that. Please try again.'))
        return
      }
      const data = await res.json()
      setReference(data.reference)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (reference) {
    const willEmail = signedIn ? accountEmail : email.trim() || null
    return (
      <div className="border border-neutral-800 bg-neutral-900/50 p-6 md:p-8">
        <div className="flex items-start gap-3 mb-6">
          <svg
            className="w-6 h-6 text-[#D32F2F] flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <h2 className="text-white text-xl font-bold mb-1">Sent. Thank you.</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">
              AvoidXray is made by one person, and this went straight to him.
            </p>
          </div>
        </div>

        <div className="border border-neutral-800 bg-[#0a0a0a] p-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
            Your reference
          </p>
          <p className="text-white text-2xl font-bold font-mono tracking-tight">{reference}</p>
        </div>

        <p className="text-neutral-400 text-sm leading-relaxed mb-6">
          {willEmail ? (
            <>
              You&apos;ll get an email at{' '}
              <span className="text-neutral-200">{willEmail}</span> the moment this changes — you
              don&apos;t need to check back. The link below works too.
            </>
          ) : (
            <>
              You didn&apos;t leave an email, so this is the only way back to it.{' '}
              <span className="text-neutral-200">Save the link before you close this page.</span>
            </>
          )}
        </p>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/report/${reference}`} variant="primary" size="md">
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
    <form onSubmit={submit} className="space-y-8">
      <fieldset>
        <legend className="text-white text-sm font-bold uppercase tracking-wider mb-1">
          What kind of message is this?
        </legend>
        <p className="text-neutral-500 text-sm mb-4">
          Only so it reaches the right pile — pick whichever is closest.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {FEEDBACK_KINDS.map((option) => {
            const selected = kind === option.value
            return (
              <label
                key={option.value}
                className={`flex flex-col gap-1 p-4 border cursor-pointer transition-colors ${
                  selected
                    ? 'border-[#D32F2F] bg-[#D32F2F]/5'
                    : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="kind"
                    value={option.value}
                    checked={selected}
                    onChange={() => setKind(option.value)}
                    className="accent-[#D32F2F]"
                  />
                  <span className="text-white text-sm font-semibold">{option.label}</span>
                </span>
                <span className="text-neutral-500 text-xs leading-relaxed pl-6">{option.hint}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="feedback-message" className="block text-white text-sm font-bold uppercase tracking-wider mb-1">
          What happened?
        </label>
        <p className="text-neutral-500 text-sm mb-3">
          Plain words are perfect. What you were trying to do, and what the site did instead.
        </p>
        <FieldTextarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          maxLength={FEEDBACK_MESSAGE_MAX}
          required
          aria-describedby="feedback-message-help"
          placeholder={
            'e.g. I tried to upload three photos from my phone. The first two worked and the third just spun forever, then said "upload failed".'
          }
        />
        <p id="feedback-message-help" className="mt-2 text-xs text-neutral-500">
          {tooShort ? (
            <span className="text-neutral-400">A few more words, so this can be acted on.</span>
          ) : remaining < 200 ? (
            <span className="text-neutral-400">{remaining.toLocaleString('en-US')} characters left.</span>
          ) : (
            'No need to be technical. Screenshots aren’t needed either.'
          )}
        </p>
      </div>

      <div>
        <label htmlFor="feedback-email" className="block text-white text-sm font-bold uppercase tracking-wider mb-1">
          Email {signedIn ? '' : <span className="text-neutral-500 font-normal normal-case tracking-normal">— optional</span>}
        </label>
        {signedIn ? (
          <p className="text-neutral-500 text-sm">
            You&apos;re signed in, so the reply goes to{' '}
            <span className="text-neutral-300">{accountEmail}</span>.
          </p>
        ) : (
          <>
            <p className="text-neutral-500 text-sm mb-3">
              Only used to tell you what happened to this. Leave it blank if you&apos;d rather not —
              you&apos;ll still get a link to check back on.
            </p>
            <FieldInput
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </>
        )}
      </div>

      {/* What gets attached, shown rather than collected quietly. Someone
          reporting a broken page should not have to describe their own browser,
          and should not have to wonder what else was taken. */}
      <div className="border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
          Attached automatically
        </p>
        {context ? (
          <dl className="space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="text-neutral-500 w-16 flex-shrink-0">Page</dt>
              <dd className="text-neutral-300 font-mono break-all">{context.page}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-neutral-500 w-16 flex-shrink-0">Browser</dt>
              <dd className="text-neutral-300 font-mono break-all line-clamp-2">{context.browser}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-neutral-600">Reading…</p>
        )}
        <p className="text-xs text-neutral-500 mt-3">That&apos;s everything. No tracking, nothing else.</p>
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

      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-neutral-900">
        <Button type="submit" variant="primary" size="lg" disabled={!canSend}>
          {busy ? 'Sending…' : 'Send it'}
        </Button>
        <p className="text-xs text-neutral-500">
          Already sent one?{' '}
          <Link href="/report/lookup" className="text-neutral-300 hover:text-white underline underline-offset-2">
            Look it up by reference
          </Link>
        </p>
      </div>
    </form>
  )
}
