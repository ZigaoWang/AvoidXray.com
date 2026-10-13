'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/password'
import FieldLabel from '@/components/ui/FieldLabel'
import { PasswordInput } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { apiErrorMessage } from '@/lib/apiError'
import { textLinkClass } from '@/components/ui/TextLink'
import Alert from '@/components/ui/Alert'

function ResetPasswordFields() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // A missing token is known at mount and is cleared by the first submit.
  const [error, setError] = useState(() => (token ? '' : 'This reset link is not valid.'))
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  // An expired or used link, which only the server can tell. It said so with
  // nothing to click, and the only way out was Sign in.
  const [linkDead, setLinkDead] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    // The shared rule, so this form cannot accept something the server will
    // then refuse for a reason it never mentioned.
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => router.push('/login'), 2000)
      } else {
        if (res.status === 410) setLinkDead(true)
        setError(await apiErrorMessage(res, 'Could not reset your password'))
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div role="status">
        <p className="mb-2 text-lg font-medium text-white">Password changed</p>
        <p className="mb-6 text-neutral-400">Taking you to the sign-in page…</p>
        <p className="text-sm text-neutral-500">
          <Link href="/login" className={textLinkClass}>
            Go there now
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert>
          {error}
          {(!token || linkDead) && (
            <>
              {' '}
              <Link href="/forgot-password" className="underline hover:no-underline">
                Request a new one
              </Link>
              .
            </>
          )}
        </Alert>
      )}

      <div>
        <FieldLabel htmlFor="new-password" required>New password</FieldLabel>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={!token}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="mt-1.5 text-xs text-neutral-500">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="confirm-password" required>Confirm password</FieldLabel>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
          disabled={!token}
        />
      </div>

      <Button type="submit" disabled={loading || !token} fullWidth className="mt-6">
        {loading ? 'Saving…' : 'Reset password'}
      </Button>
    </form>
  )
}

export default function ResetPasswordForm() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <ResetPasswordFields />
    </Suspense>
  )
}

/** The link under the form, rendered into the shell's footer slot. */
export function ResetPasswordFooter() {
  return (
    <p>
      Remembered it?{' '}
      <Link href="/login" className={textLinkClass}>
        Sign in
      </Link>
    </p>
  )
}
