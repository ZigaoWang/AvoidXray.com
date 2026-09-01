'use client'
import { useState } from 'react'
import { MIN_PASSWORD_LENGTH } from '@/lib/password'
import Link from 'next/link'
import Image from 'next/image'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'

export default function RegisterPage() {
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
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, acceptedTerms })
    })
    setLoading(false)
    if (res.ok) setSuccess(true)
    else setError((await res.json()).error || 'Registration failed')
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
            <p className="text-neutral-400 mb-6">We sent a verification link to <span className="text-white">{form.email}</span></p>
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
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Join</h1>
          <p className="text-neutral-500 mb-8">Create your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-[#D32F2F] text-white text-sm px-4 py-3">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Username</FieldLabel>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className={`${fieldClass}`}
                  required
                />
              </div>
              <div>
                <FieldLabel>Name</FieldLabel>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className={`${fieldClass}`}
                />
              </div>
            </div>

            <div>
              <FieldLabel required>Email</FieldLabel>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className={`${fieldClass}`}
                required
              />
            </div>

            <div>
              <FieldLabel required>Password</FieldLabel>
              <input
                type="password"
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
                {/* Age is folded into the same tick rather than asking for a
                    date of birth. The floor needs stating somewhere a person
                    actually reads, and a birthdate would be more personal data
                    held for no other purpose. */}
                I&rsquo;m 14 or older, and I agree to the{' '}
                <Link
                  href="/legal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white underline underline-offset-2 hover:text-[#D32F2F]"
                >
                  terms, privacy policy and community guidelines
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

          <p className="mt-6 text-neutral-500 text-sm">
            Have an account? <Link href="/login" className="text-white hover:text-[#D32F2F]">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
