'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Footer from '@/components/Footer'

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', username: '', name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    setLoading(false)
    if (res.ok) router.push('/login')
    else setError((await res.json()).error || 'Registration failed')
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
            <h1 className="text-3xl text-white mb-3" >Join the community</h1>
            <p className="text-neutral-600 text-sm">Create your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="text-red-500 text-sm text-center">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full p-3 bg-transparent text-white border-b border-neutral-800 focus:border-white focus:outline-none transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full p-3 bg-transparent text-white border-b border-neutral-800 focus:border-white focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full p-3 bg-transparent text-white border-b border-neutral-800 focus:border-white focus:outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full p-3 bg-transparent text-white border-b border-neutral-800 focus:border-white focus:outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white border border-neutral-700 py-3 text-sm uppercase tracking-wider hover:bg-white hover:text-black disabled:opacity-50 transition-colors mt-8"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-10 text-center text-neutral-600 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-white hover:underline">Sign in</Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
