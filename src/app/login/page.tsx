'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Footer from '@/components/Footer'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) setError('Invalid email or password')
    else router.push('/')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="border-b border-neutral-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
          <Link href="/" className="text-white text-lg tracking-tight" >
            Film Gallery
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="text-center mb-12">
            <h1 className="text-3xl text-white mb-3" >Welcome back</h1>
            <p className="text-neutral-600 text-sm">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="text-red-500 text-sm text-center">{error}</div>
            )}

            <div>
              <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-3 bg-transparent text-white border-b border-neutral-800 focus:border-white focus:outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-3 bg-transparent text-white border-b border-neutral-800 focus:border-white focus:outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white border border-neutral-700 py-3 text-sm uppercase tracking-wider hover:bg-white hover:text-black disabled:opacity-50 transition-colors mt-8"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-10 text-center text-neutral-600 text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-white hover:underline">Create one</Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
