import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { legalHtml } from '@/lib/legal'
import { SITE_URL } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Terms, Privacy and Community Guidelines',
  description:
    'The agreement between you and AvoidXray, what we do with your data, and what we expect from people using the site.',
  alternates: { canonical: `${SITE_URL}/legal` },
}

/**
 * The whole document on one page.
 *
 * One page rather than three: the parts cross-reference each other constantly,
 * and the anchors in the source only work if they share a document. It also
 * means there is one URL to point at from sign-up, which is the page someone
 * has to be able to read before agreeing to it.
 */
export default async function LegalPage() {
  const html = await legalHtml()

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        {/*
          Typography is set here rather than in the markdown, so the document
          stays a plain readable file. `scroll-mt` on the headings keeps the
          in-page anchors clear of the sticky header.
        */}
        <article
          className="
            text-neutral-300 leading-relaxed
            [&_h1]:text-3xl [&_h1]:md:text-4xl [&_h1]:font-black [&_h1]:text-white
            [&_h1]:tracking-tight [&_h1]:mt-14 [&_h1]:mb-5 [&_h1]:scroll-mt-24
            [&_h1:first-child]:mt-0
            [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24
            [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-white [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:scroll-mt-24
            [&_p]:my-4
            [&_strong]:text-white [&_strong]:font-semibold
            [&_em]:text-neutral-400
            [&_a]:text-[#EF5350] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-white
            [&_ul]:my-4 [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-6
            [&_ol]:my-4 [&_ol]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-6
            [&_li]:pl-1
            [&_hr]:my-12 [&_hr]:border-neutral-800
            [&_table]:w-full [&_table]:my-6 [&_table]:text-sm [&_table]:border [&_table]:border-neutral-800
            [&_th]:text-left [&_th]:text-white [&_th]:font-semibold [&_th]:p-3
            [&_th]:border-b [&_th]:border-neutral-800 [&_th]:bg-neutral-900
            [&_td]:p-3 [&_td]:align-top [&_td]:border-b [&_td]:border-neutral-900
          "
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>

      <Footer />
    </div>
  )
}
