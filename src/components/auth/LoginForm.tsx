'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass, PasswordInput } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { apiErrorMessage } from '@/lib/apiError'
import { textLinkClass } from '@/components/ui/TextLink'
import { sameOriginPath } from '@/lib/validation'

/**
 * What confirming on /verify sends people back here with. It redirects instead
 * of rendering a result of its own, so this code is the only account of what
 * went wrong. Every code but one went unread, which left
 * the reader on a login page that gave no reason for sending them there.
 */
const VERIFY_ERRORS: Record<string, string> = {
  invalid: 'That verification link is not valid. Sign in and we can send a new one.',
  expired: 'That link has expired or was already used. Sign in, and if your email still needs confirming we will send a new link.',
  rate: 'Too many attempts. Wait a few minutes and open the link again.',
}

function LoginFormFields() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Seeded from the query string the verification links redirect back with.
  // Read once at mount rather than pushed in by an effect: both messages are
  // cleared as soon as the form is submitted, so re-deriving them on every
  // searchParams change would resurrect a notice the user had moved past.
  const [error, setError] = useState(() => VERIFY_ERRORS[searchParams.get('error') ?? ''] ?? '')
  const [success, setSuccess] = useState(() =>
    searchParams.get('verified') === 'true' ? 'Email verified. You can now sign in.' : ''
  )
  const [loading, setLoading] = useState(false)
  const [showResend, setShowResend] = useState(false)
  const [resending, setResending] = useState(false)

  /**
   * Where to land after signing in.
   *
   * Everything that sends a signed-out person here — liking a photo, following
   * someone, opening a page that needs an account — did so from somewhere they
   * were in the middle of, and every one of them was then dropped on the
   * homepage with no way back except the history stack.
   *
   * Only same-origin paths are honoured. An absolute URL in a query parameter
   * that the site obediently redirects to after authenticating is an open
   * redirect, and a convincing one, because the reader has just typed their
   * password into the real site.
   */
  const destination = sameOriginPath(searchParams.get('callbackUrl')) ?? '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setShowResend(false)

    try {
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.error) {
        // authorize() throws for the two failures that are not simply a wrong
        // password, because without this each surfaces as "invalid email or
        // password" and sends the user round the loop retrying credentials
        // that are probably correct.
        //
        // The unverified case used to be asked for separately, by posting the
        // address to /api/check-verification before trying to sign in. That
        // cost a round trip on every single sign-in, and it answered whether
        // an address was registered and unconfirmed to anybody who asked,
        // without their having to know the password. It comes from authorize()
        // now, which only reaches that check once the password has matched.
        if (res.error.includes('EMAIL_NOT_VERIFIED')) {
          setError('Email not verified.')
          setShowResend(true)
        } else if (res.error.includes('RATE_LIMITED')) {
          setError('Too many sign-in attempts. Please wait a few minutes and try again.')
        } else {
          setError('Invalid email or password')
        }
      } else {
        router.push(destination)
      }
    } catch {
      // A dropped connection used to reject out of this handler with `loading`
      // still true, leaving the button reading "Signing in…" for good and no
      // indication that anything had gone wrong.
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (res.ok) {
        setSuccess('Verification email sent. Check your inbox.')
        setError('')
        setShowResend(false)
      } else {
        // A rejected resend — usually the per-address hourly limit — said
        // nothing at all, so the button appeared to do nothing and people
        // pressed it again.
        setError(await apiErrorMessage(res, 'Could not send that email. Please try again shortly.'))
        setShowResend(false)
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Announced, not just drawn. Everything this form has to say about a
            failed attempt appears here, and a screen reader was told none of
            it — the page simply sat there after Enter. */}
        {success && <div role="status" className="bg-[#1B5E20] text-white text-sm px-4 py-3">{success}</div>}
        {error && (
          <div role="alert" className="bg-brand text-white text-sm px-4 py-3">
            {error}
            {showResend && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="ml-2 underline hover:no-underline"
              >
                {resending ? 'Sending…' : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        {/* Labels are tied to their controls and the fields say what they
            hold, so a password manager can fill them and a screen reader
            announces the label on focus. Neither was true before. */}
        <div>
          <FieldLabel htmlFor="login-identifier" required>Email or username</FieldLabel>
          <input
            id="login-identifier"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={fieldClass}
            required
          />
        </div>

        <div>
          <FieldLabel htmlFor="login-password" required>Password</FieldLabel>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        <Button
          type="submit"
          disabled={loading} fullWidth className="mt-6">
          {loading ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>

    </>
  )
}

/**
 * Wrapped in Suspense because it reads the query string, which Next requires
 * a boundary for. The fallback matches the form's height so the panel does
 * not jump when it swaps in.
 */
export default function LoginForm() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <LoginFormFields />
    </Suspense>
  )
}

/** The links under the form, rendered into the shell's footer slot. */
export function LoginFooter() {
  return (
    <>
      <p>
        <Link href="/forgot-password" className={textLinkClass}>
          Forgot your password?
        </Link>
      </p>
      <p className="mt-2">
        No account?{' '}
        <Link href="/register" className={textLinkClass}>
          Create one
        </Link>
      </p>
    </>
  )
}
