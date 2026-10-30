import type { Metadata } from 'next'
import Header from '@/components/Header'
import { ButtonLink } from '@/components/ui/Button'
import PageMessage from '@/components/ui/PageMessage'
import PageShell from '@/components/PageShell'

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
    <PageShell header={<Header />}>

      <PageMessage
        kicker={<p className="mb-4 text-8xl font-black text-brand">404</p>}
        title="Film fogged"
        actions={
          <>
            <ButtonLink href="/explore">Explore photos</ButtonLink>
            <ButtonLink href="/" variant="secondary">Go home</ButtonLink>
          </>
        }
      >
        This page got exposed to light. It may have been deleted, or the link may be wrong.
      </PageMessage>

    </PageShell>
  )
}
