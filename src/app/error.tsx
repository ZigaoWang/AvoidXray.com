'use client'

import { useEffect } from 'react'
import Button, { ButtonLink } from '@/components/ui/Button'
import ClientHeader from '@/components/ClientHeader'
import PageMessage from '@/components/ui/PageMessage'
import Footer from '@/components/Footer'

/**
 * What a reader sees when a page throws.
 *
 * There was no error boundary at the route level, so an unhandled server error
 * fell through to Next's own page: an unstyled message on a white background,
 * with no way back into the site. This keeps people inside it and offers the
 * one thing that usually works — trying again.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[page error]', error)
  }, [error])

  return (
    // The site's header, as the 404 page has, so a failed page still leaves a
    // way to search or move on. The page it replaces drew its own.
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <PageMessage
        title="This page could not load"
        actions={
          <>
            <Button onClick={retry}>Try again</Button>
            <ButtonLink href="/" variant="secondary">Go home</ButtonLink>
          </>
        }
      >
        <p>The problem is on our end. Try again, and if it keeps happening, send us the error ID below.</p>
        {/* The digest is what ties this to a line in the server log. */}
        {error.digest && <p className="mt-6 font-mono text-[11px] text-neutral-400">Error ID: {error.digest}</p>}
      </PageMessage>
      <Footer />
    </div>
  )
}
