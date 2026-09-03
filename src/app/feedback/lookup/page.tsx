import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Button from '@/components/ui/Button'
import { FieldInput } from '@/components/ui/Field'
import { normalizeFeedbackReference } from '@/lib/feedback'
import { textLinkClass } from '@/components/ui/TextLink'

export const metadata: Metadata = {
  title: 'Find your message',
  robots: { index: false, follow: false },
}

/**
 * Finds a report from its reference.
 *
 * For the person who lost the link but still has the code — off a screenshot,
 * or copied onto paper. A server action rather than a fetch so it works with
 * JavaScript unavailable, which is the state some people reporting a broken
 * page are actually in.
 *
 * Note this is a static segment sitting beside `[reference]`. Next resolves
 * static segments first, and "lookup" can never be a valid reference anyway —
 * normalizeFeedbackReference requires ten characters after the prefix.
 */
export default async function ReportLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function find(formData: FormData) {
    'use server'
    const raw = String(formData.get('reference') ?? '')
    const normalized = normalizeFeedbackReference(raw)
    // Deliberately not checked against the database here. Answering "that
    // reference does not exist" would turn this box into an oracle for
    // guessing them; an unknown-but-well-formed code lands on the same 404
    // page as a malformed one.
    if (!normalized) redirect('/report/lookup?error=1')
    redirect(`/report/${normalized}`)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-md mx-auto px-4 md:px-6 py-10 md:py-16">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-3">
          Find your message
        </h1>
        <p className="text-neutral-400 text-sm leading-relaxed mb-8">
          Enter the reference you were given, e.g.{' '}
          <span className="font-mono text-neutral-300">AX-7QK4M2XTB9</span>.
        </p>

        <form action={find} className="space-y-4">
          <div>
            <label htmlFor="reference" className="sr-only">
              Reference
            </label>
            <FieldInput
              id="reference"
              name="reference"
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="AX-7QK4M2XTB9"
              className="font-mono"
              aria-describedby={error ? 'reference-error' : undefined}
            />
            {error && (
              <p id="reference-error" role="alert" className="mt-2 text-sm text-[#EF5350]">
                That doesn&apos;t look like a reference. Check for a missing character.
              </p>
            )}
          </div>
          <Button type="submit" variant="primary" size="lg" fullWidth>
            Find it
          </Button>
        </form>

        <p className="mt-8 text-sm text-neutral-500">
          Don&apos;t have it?{' '}
          <Link
            href="/feedback"
            className={textLinkClass}
          >
            Send a new message
          </Link>
          .
        </p>
      </main>

      <Footer />
    </div>
  )
}
