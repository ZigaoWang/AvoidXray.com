import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FeedbackForm from '@/components/FeedbackForm'
import { SITE_URL } from '@/lib/seo/site'

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

        {/* Content moderation is a different queue with different context, and
            someone arriving here about a person should be sent to it. */}
        <p className="mt-12 pt-8 border-t border-neutral-900 text-sm text-neutral-500 leading-relaxed">
          To report a photo, comment or account, use the Report link on the item itself.
        </p>
      </main>

      <Footer />
    </div>
  )
}
