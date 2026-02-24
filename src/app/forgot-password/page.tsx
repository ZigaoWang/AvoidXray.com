'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    setLoading(false)
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <header className="py-5 px-6">
          <Link href="/"><Image src="/logo.svg" alt="AvoidXray" width={160} height={32} /></Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <h1 className="text-4xl font-black text-white mb-4">Check your email</h1>
            <p className="text-neutral-400 mb-6">If an account exists, we sent a password reset link to <span className="text-white">{email}</span></p>
            <Link href="/login" className="text-[#D32F2F] hover:underline">Back to login</Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="py-5 px-6">
        <Link href="/">
          <Image src="/logo.svg" alt="AvoidXray" width={160} height={32} />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Forgot Password</h1>
          <p className="text-neutral-500 mb-8">Enter your email to reset your password</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D32F2F] text-white py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] disabled:opacity-50 transition-colors mt-6"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p className="mt-6 text-neutral-500 text-sm">
            Remember your password? <Link href="/login" className="text-white hover:text-[#D32F2F]">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
