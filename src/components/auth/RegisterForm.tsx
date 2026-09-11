'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/password'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass, PasswordInput } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { apiErrorMessage } from '@/lib/apiError'
import { textLinkClass } from '@/components/ui/TextLink'

export default function RegisterForm() {
  const [form, setForm] = useState({ email: '', password: '', username: '', name: '' })
  // Held outside `form` because that object is sent as the request body.
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  /**
   * Null while the form is still up. Once the account exists, whether the
   * verification email actually went out.
   *
   * The two cases used to be one. Registration answers 200 with an
   * `emailWarning` when the send fails — the account is real, the link is
   * not — and this form checked only `res.ok`, so it told people to go and
   * look for a message that was never sent, and to wait 24 hours for it to
   * expire.
   */
  const [created, setCreated] = useState<{ emailSent: boolean } | null>(null)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[a-zA-Z0-9_-]+$/.test(form.username)) {
      setError('Username can only contain letters, numbers, underscores, and hyphens')
      return
    }
    if (form.username.length < 3 || form.username.length > 20) {
      setError('Username must be 3-20 characters')
      return
    }
    if (form.password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    // The shared rule, so this form cannot accept something the server will
    // then refuse for a reason it never mentioned.
    const problem = passwordProblem(form.password)
    if (problem) {
      setError(problem)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, acceptedTerms })
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        setCreated({ emailSent: !data?.emailWarning })
      } else setError(await apiErrorMessage(res, 'Could not create your account'))
    } catch {
      // Unhandled, a dropped connection rejected out of here with loading
      // still true, leaving the button reading "Creating…" for good.
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setError('')
    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      })
      if (res.ok) setCreated({ emailSent: true })
      // Usually the per-address hourly limit, which is worth saying rather
      // than leaving the button looking like it did nothing.
      else setError(await apiErrorMessage(res, 'Could not send that email. Please try again shortly.'))
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setResending(false)
    }
  }

  // Both post-registration states replace the form in place, so the shell —
  // logo, photographs, footer — stays put around them rather than the page
  // swapping for a bare centered message.
  if (created) {
    return created.emailSent ? (
      <div role="status">
        <p className="mb-2 text-lg font-medium text-white">Check your email</p>
        <p className="mb-6 text-neutral-400">
          We sent a verification link to <span className="text-white">{form.email}</span>. It expires in
          24 hours.
        </p>
        <p className="text-sm text-neutral-500">
          Wrong address, or nothing arrived?{' '}
          <Link href="/login" className={textLinkClass}>
            Go to sign in
          </Link>{' '}
          and we can send it again.
        </p>
      </div>
    ) : (
      <div role="status">
        <p className="mb-2 text-lg font-medium text-white">Your account is ready</p>
        <p className="mb-6 text-neutral-400">
          We could not send the verification link to{' '}
          <span className="text-white">{form.email}</span> just now. Your account is safe, so you can
          ask for the link again.
        </p>

        {error && (
          <div role="alert" className="mb-4 bg-brand text-white text-sm px-4 py-3">
            {error}
          </div>
        )}
        <Button onClick={handleResend} disabled={resending} fullWidth>
          {resending ? 'Sending…' : 'Send the link again'}
        </Button>

        <p className="mt-4 text-sm text-neutral-500">
          Still nothing?{' '}
          <Link href="/login" className={textLinkClass}>
            Go to sign in
          </Link>{' '}
          and try from there.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Announced, like the sign-in form's. */}
      {error && <div role="alert" className="bg-brand text-white text-sm px-4 py-3">{error}</div>}

      {/* Stacked on a narrow phone: side by side, Username and Name were
          about 130px each, which is not enough to read what you typed. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="register-username" required>Username</FieldLabel>
          <input
            id="register-username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            className={`${fieldClass}`}
            required
          />
        </div>
        <div>
          <FieldLabel htmlFor="register-name">Name</FieldLabel>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className={`${fieldClass}`}
          />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="register-email" required>Email</FieldLabel>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          className={`${fieldClass}`}
          required
        />
      </div>

      <div>
        <FieldLabel htmlFor="register-password" required>Password</FieldLabel>
        <PasswordInput
          id="register-password"
          autoComplete="new-password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby="password-hint"
        />
        {/* Stated up front rather than as an error after submitting. */}
        <p id="password-hint" className="text-neutral-500 text-xs mt-1.5">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      {/* Sign-up is the one password form where a typo cannot be undone by the
          person who made it: the account is created, the address is verified,
          and the first sign-in fails for no visible reason. */}
      <div>
        <FieldLabel htmlFor="register-confirm-password" required>Confirm password</FieldLabel>
        <PasswordInput
          id="register-confirm-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
        />
      </div>

      {/* A real checkbox that has to be ticked, not a line of small
          print saying that continuing implies agreement. It is the thing
          the stored record refers to, so it has to be a deliberate act.
          The links open in a new tab so a half-filled form is not lost
          to reading the document. */}
      <div className="flex gap-3 pt-2">
        <input
          id="accept-terms"
          type="checkbox"
          checked={acceptedTerms}
          onChange={e => setAcceptedTerms(e.target.checked)}
          required
          // h-5, matching the checkboxes on the upload form. This one was h-4,
          // so the single tick that records consent was the smallest target on
          // the site and a different size from every other checkbox in it.
          className="mt-0.5 h-5 w-5 flex-shrink-0 accent-brand"
        />
        <label htmlFor="accept-terms" className="text-neutral-400 text-sm leading-relaxed">
          {/* Age sits in the same tick rather than in a date-of-birth
              field: it has to be stated somewhere a person reads, and a
              birthdate would be more personal data kept for no other
              purpose. Kept to one short line — a paragraph of conditions
              beside a checkbox is how nobody reads either. */}
          I&rsquo;m 14 or older and agree to the{' '}
          <Link
            href="/legal"
            target="_blank"
            rel="noopener noreferrer"
            className={textLinkClass}
          >
            terms and privacy policy
          </Link>{' '}
          and the{' '}
          <Link
            href="/guidelines"
            target="_blank"
            rel="noopener noreferrer"
            className={textLinkClass}
          >
            guidelines
          </Link>
          .
        </label>
      </div>

      <Button
        type="submit"
        disabled={loading || !acceptedTerms} fullWidth className="mt-6">
        {loading ? 'Creating…' : 'Create Account'}
      </Button>
    </form>
  )
}

/** The link under the form, rendered into the shell's footer slot. */
export function RegisterFooter() {
  return (
    <p>
      Have an account?{' '}
      <Link href="/login" className={textLinkClass}>
        Sign in
      </Link>
    </p>
  )
}
