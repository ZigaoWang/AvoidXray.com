import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ReportIssueForm from '@/components/ReportIssueForm'
import { SITE_URL } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Report a problem',
  description:
    'Tell us about something broken on AvoidXray, or suggest something the site should do. No account needed, and you get a reply.',
  alternates: { canonical: `${SITE_URL}/report` },
  openGraph: {
    title: 'Report a problem – AvoidXray',
    description: 'Something broken? Tell us. No account needed, and you get a reply.',
    url: `${SITE_URL}/report`,
  },
}

/**
 * Replaces a footer link that pointed at the GitHub issue tracker.
 *
 * That link asked a film photographer to make a developer account, learn an
 * issue template and write in public in order to say that a button did not
 * work. Almost nobody does that, so almost nothing was ever reported.
 */
export default function ReportPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">
            Something not working?
          </h1>
          <p className="text-neutral-400 leading-relaxed">
            Tell us here. You don&apos;t need an account, you don&apos;t need to know what caused
            it, and you don&apos;t need to write it up formally — &ldquo;the upload button does
            nothing on my phone&rdquo; is a genuinely useful report.
          </p>
          <p className="text-neutral-400 leading-relaxed mt-3">
            Every message gets a reference and a reply. If it turns out to be a real fault,
            you&apos;ll hear when it&apos;s fixed.
          </p>
        </header>

        <ReportIssueForm />

        {/* Reporting a photo or a person is a different job with a different
            queue, and someone arriving here angry about a person should be
            pointed at it rather than left to use the wrong form. */}
        <aside className="mt-12 pt-8 border-t border-neutral-900">
          <h2 className="text-white text-sm font-bold uppercase tracking-wider mb-2">
            Reporting a photo or a person?
          </h2>
          <p className="text-neutral-500 text-sm leading-relaxed">
            This form is for the site itself. To report a photo, a comment or an account, use the
            Report link on the item in question — that reaches the moderation queue directly, with
            the context already attached.
          </p>
        </aside>
      </main>

      <Footer />
    </div>
  )
}
