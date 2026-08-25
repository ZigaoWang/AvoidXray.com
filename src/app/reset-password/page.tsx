'use client'
import { useState, Suspense } from 'react'
import { MIN_PASSWORD_LENGTH } from '@/lib/password'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // A missing token is known at mount and is cleared by the first submit.
  const [error, setError] = useState(() => (token ? '' : 'Invalid reset link'))
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    })
    setLoading(false)
    if (res.ok) {
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2000)
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to reset password')
    }
  }

  if (success) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-4xl font-black text-white mb-4">Password Reset</h1>
        <p className="text-neutral-400 mb-6">Your password has been reset successfully. Redirecting to login...</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Reset Password</h1>
      <p className="text-neutral-500 mb-8">Enter your new password</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-[#D32F2F] text-white text-sm px-4 py-3">{error}</div>}

        <div>
          <FieldLabel required>New Password</FieldLabel>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`${fieldClass}`}
            required
            minLength={MIN_PASSWORD_LENGTH}
            disabled={!token}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-neutral-500 text-xs mt-1.5">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div>
          <FieldLabel required>Confirm Password</FieldLabel>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className={`${fieldClass}`}
            required
            disabled={!token}
          />
        </div>

        <Button
          type="submit"
          disabled={loading || !token} fullWidth className="mt-6">
          {loading ? 'Resetting...' : 'Reset Password'}
        </Button>
      </form>

      <p className="mt-6 text-neutral-500 text-sm">
        Remember your password? <Link href="/login" className="text-white hover:text-[#D32F2F]">Sign in</Link>
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="py-5 px-6">
        <Link href="/">
          <Image src="/logo.svg" alt="AvoidXray" width={160} height={32} />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <Suspense fallback={<div className="text-white">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </div>
  )
}
