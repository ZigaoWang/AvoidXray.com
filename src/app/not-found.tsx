import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { ButtonLink } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

/**
 * The page for a URL that does not resolve.
 *
 * It had no header and no footer, so a 404 was a dead end: one button back to
 * the homepage and no search, no nav, no way to get to the thing you were
 * looking for from where you had landed. A mistyped or long-dead photo URL is
 * exactly the moment someone needs the search box most.
 */
export default function NotFound() {
  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="text-center">
          <p className="mb-4 text-8xl font-black text-[#D32F2F]">404</p>
          <h1 className="mb-2 text-2xl font-bold text-white">Film Fogged</h1>
          <p className="mb-8 text-neutral-500">
            This page got exposed to light. It may have been deleted, or the link may be wrong.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/explore">Explore photos</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Go home
            </ButtonLink>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
