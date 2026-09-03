'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MIN_PASSWORD_LENGTH } from '@/lib/password'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { apiErrorMessage } from '@/lib/apiError'

export default function RegisterForm() {
  const [form, setForm] = useState({ email: '', password: '', username: '', name: '' })
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

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
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, acceptedTerms })
      })
      if (res.ok) setSuccess(true)
      else setError(await apiErrorMessage(res, 'Could not create your account'))
    } catch {
      // Unhandled, a dropped connection rejected out of here with loading
      // still true, leaving the button reading "Creating..." for good.
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  // The "check your email" state replaces the form in place, so the shell —
  // logo, photographs, footer — stays put around it rather than the page
  // swapping for a bare centred message.
  if (success) {
    return (
      <div role="status">
        <p className="mb-2 text-lg font-medium text-white">Check your email</p>
        <p className="mb-6 text-neutral-400">
          We sent a verification link to <span className="text-white">{form.email}</span>. It expires in
          24 hours.
        </p>
        <p className="text-sm text-neutral-500">
          Wrong address, or nothing arrived?{' '}
          <Link href="/login" className="text-white underline underline-offset-2 hover:text-[#D32F2F]">
            Go to sign in
          </Link>{' '}
          and we can send it again.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Announced, like the sign-in form's. */}
      {error && <div role="alert" className="bg-[#D32F2F] text-white text-sm px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
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
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          className={`${fieldClass}`}
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby="password-hint"
        />
        {/* Stated up front rather than as an error after submitting. */}
        <p id="password-hint" className="text-neutral-500 text-xs mt-1.5">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
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
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#D32F2F]"
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
            className="text-white underline underline-offset-2 hover:text-[#D32F2F]"
          >
            terms and privacy policy
          </Link>{' '}
          and the{' '}
          <Link
            href="/guidelines"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline underline-offset-2 hover:text-[#D32F2F]"
          >
            guidelines
          </Link>
          .
        </label>
      </div>

      <Button
        type="submit"
        disabled={loading || !acceptedTerms} fullWidth className="mt-6">
        {loading ? 'Creating...' : 'Create Account'}
      </Button>
    </form>
  )
}

/** The link under the form, rendered into the shell's footer slot. */
export function RegisterFooter() {
  return (
    <p>
      Have an account?{' '}
      <Link href="/login" className="text-white underline underline-offset-2 hover:text-[#D32F2F]">
        Sign in
      </Link>
    </p>
  )
}
