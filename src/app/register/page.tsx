'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'

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
      <header className="py-5 px-6">
        <Logo />
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Join</h1>
          <p className="text-neutral-500 mb-8">Create your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-[#D32F2F] text-white text-sm px-4 py-3">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D32F2F] text-white py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] disabled:opacity-50 transition-colors mt-6"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-neutral-500 text-sm">
            Have an account? <Link href="/login" className="text-white hover:text-[#D32F2F]">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
