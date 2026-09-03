import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FeedbackForm from '@/components/FeedbackForm'
import { SITE_URL } from '@/lib/seo/site'
import { textLinkClass } from '@/components/ui/TextLink'

export const metadata: Metadata = {
  title: 'Feedback',
  description:
    'Report a problem with AvoidXray or suggest an improvement. No account required, and every message gets a reply.',
  alternates: { canonical: `${SITE_URL}/feedback` },
  openGraph: {
    title: 'Feedback – AvoidXray',
    description: 'Report a problem or suggest an improvement. No account required.',
    url: `${SITE_URL}/feedback`,
  },
}

/**
 * Replaces a footer link that pointed at the GitHub issue tracker, which
 * required a developer account and a public post to report a broken button.
 */
export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">Feedback</h1>
        <p className="text-neutral-400 leading-relaxed mb-10">
          Report a problem or suggest an improvement. No account needed, and you&apos;ll get a
          reply.
        </p>

        <FeedbackForm />

        {/* The two things somebody might want that are not this form: an
            earlier message of their own, and the moderation queue. Kept
            together at the foot rather than beside the Send button, where
            "check a previous message" competed with the action. */}
        <div className="mt-12 pt-8 border-t border-neutral-900 space-y-2 text-sm text-neutral-500 leading-relaxed">
          <p>
            Sent something already?{' '}
            <Link
              href="/feedback/lookup"
              className={textLinkClass}
            >
              Check a previous message
            </Link>
            .
          </p>
          <p>To report a photo, comment or account, use the Report link on the item itself.</p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
