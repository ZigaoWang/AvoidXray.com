'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/password'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { apiErrorMessage } from '@/lib/apiError'

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
          <Link href="/login" className="text-white underline underline-offset-2 hover:text-[#D32F2F]">
            Go there now
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="bg-[#D32F2F] px-4 py-3 text-sm text-white">
          {error}
          {!token && (
            <>
              {' '}
              <Link href="/forgot-password" className="underline hover:no-underline">
                Request a new one
              </Link>
              .
            </>
          )}
        </div>
      )}

      <div>
        <FieldLabel htmlFor="new-password" required>New password</FieldLabel>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={fieldClass}
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
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className={fieldClass}
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
      <Link href="/login" className="text-white underline underline-offset-2 hover:text-[#D32F2F]">
        Sign in
      </Link>
    </p>
  )
}
