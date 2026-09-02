'use client'
import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { apiErrorMessage } from '@/lib/apiError'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Seeded from the query string the verification links redirect back with.
  // Read once at mount rather than pushed in by an effect: both messages are
  // cleared as soon as the form is submitted, so re-deriving them on every
  // searchParams change would resurrect a notice the user had moved past.
  const [error, setError] = useState(() =>
    searchParams.get('error') === 'invalid' ? 'Invalid or expired verification link.' : ''
  )
  const [success, setSuccess] = useState(() =>
    searchParams.get('verified') === 'true' ? 'Email verified! You can now sign in.' : ''
  )
  const [loading, setLoading] = useState(false)
  const [showResend, setShowResend] = useState(false)
  const [resending, setResending] = useState(false)

  /**
   * Where to land after signing in.
   *
   * Everything that sends a signed-out person here — liking a photo, following
   * someone, opening a page that needs an account — did so from somewhere they
   * were in the middle of, and every one of them was then dropped on the
   * homepage with no way back except the history stack.
   *
   * Only same-origin paths are honoured. An absolute URL in a query parameter
   * that the site obediently redirects to after authenticating is an open
   * redirect, and a convincing one, because the reader has just typed their
   * password into the real site.
   */
  const rawCallback = searchParams.get('callbackUrl') ?? ''
  const destination =
    rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setShowResend(false)

    try {
      // Whether the account exists but has never confirmed its address, so the
      // failure can say so and offer to send the mail again rather than
      // reading as a wrong password.
      const checkRes = await fetch('/api/check-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const checkData = await checkRes.json().catch(() => ({}))

      if (checkData.unverified) {
        setError('Email not verified.')
        setShowResend(true)
        return
      }

      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.error) {
        // authorize() throws RATE_LIMITED once too many attempts have been made;
        // without this it would surface as "invalid email or password" and send
        // the user round the loop retrying credentials that are probably correct.
        setError(
          res.error.includes('RATE_LIMITED')
            ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
            : 'Invalid email or password'
        )
      } else {
        router.push(destination)
      }
    } catch {
      // A dropped connection used to reject out of this handler with `loading`
      // still true, leaving the button reading "Signing in..." for good and no
      // indication that anything had gone wrong.
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (res.ok) {
        setSuccess('Verification email sent! Check your inbox.')
        setError('')
        setShowResend(false)
      } else {
        // A rejected resend — usually the per-address hourly limit — said
        // nothing at all, so the button appeared to do nothing and people
        // pressed it again.
        setError(await apiErrorMessage(res, 'Could not send that email. Please try again shortly.'))
        setShowResend(false)
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Sign In</h1>
      <p className="text-neutral-500 mb-8">Welcome back</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Announced, not just drawn. Everything this form has to say about a
            failed attempt appears here, and a screen reader was told none of
            it — the page simply sat there after Enter. */}
        {success && <div role="status" className="bg-[#1B5E20] text-white text-sm px-4 py-3">{success}</div>}
        {error && (
          <div role="alert" className="bg-[#D32F2F] text-white text-sm px-4 py-3">
            {error}
            {showResend && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="ml-2 underline hover:no-underline"
              >
                {resending ? 'Sending...' : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        <div>
          <FieldLabel required>Email or Username</FieldLabel>
          <input
            type="text"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={`${fieldClass}`}
            required
          />
        </div>

        <div>
          <FieldLabel required>Password</FieldLabel>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`${fieldClass}`}
            required
          />
        </div>

        <Button
          type="submit"
          disabled={loading} fullWidth className="mt-6">
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <p className="mt-4 text-neutral-500 text-sm text-center">
        <Link href="/forgot-password" className="text-white hover:text-[#D32F2F]">Forgot password?</Link>
      </p>

      <p className="mt-6 text-neutral-500 text-sm">
        No account? <Link href="/register" className="text-white hover:text-[#D32F2F]">Create one</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="py-5 px-6">
        <Link href="/">
          <Image src="/logo.svg" alt="AvoidXray" width={160} height={32} />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <Suspense fallback={<div className="text-white">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  )
}
