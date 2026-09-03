'use client'

import { useState } from 'react'
import Link from 'next/link'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { textLinkClass } from '@/components/ui/TextLink'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // The response is deliberately not inspected for whether the address
      // exists — the endpoint answers the same either way, so that this form
      // cannot be used to find out who has an account here.
      await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSent(true)
    } catch {
      // Previously unhandled: a dropped connection left the button on
      // "Sending…" and then claimed the mail had been sent.
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div role="status">
        <p className="mb-2 text-lg font-medium text-white">Check your email</p>
        <p className="mb-6 text-neutral-400">
          If an account exists for <span className="text-white">{email}</span>, a reset link is on its
          way. The link expires in an hour.
        </p>
        <p className="text-sm text-neutral-500">
          <Link href="/login" className={textLinkClass}>
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div role="alert" className="bg-[#D32F2F] px-4 py-3 text-sm text-white">{error}</div>}

      <div>
        <FieldLabel htmlFor="forgot-email" required>Email</FieldLabel>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={fieldClass}
          required
        />
      </div>

      <Button type="submit" disabled={loading} fullWidth className="mt-6">
        {loading ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}

/** The link under the form, rendered into the shell's footer slot. */
export function ForgotPasswordFooter() {
  return (
    <p>
      Remembered it?{' '}
      <Link href="/login" className={textLinkClass}>
        Sign in
      </Link>
    </p>
  )
}
