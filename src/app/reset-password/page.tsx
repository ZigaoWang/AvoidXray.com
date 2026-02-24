'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link')
    }
  }, [token])

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
          <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">New Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
            required
            disabled={!token}
          />
        </div>

        <div>
          <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
            required
            disabled={!token}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !token}
          className="w-full bg-[#D32F2F] text-white py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] disabled:opacity-50 transition-colors mt-6"
        >
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
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
