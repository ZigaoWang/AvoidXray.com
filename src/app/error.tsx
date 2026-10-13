'use client'

import { useEffect } from 'react'
import Button, { ButtonLink } from '@/components/ui/Button'
import ClientHeader from '@/components/ClientHeader'

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
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <p className="text-brand text-xs uppercase tracking-wide font-bold mb-3">Something went wrong</p>
          <h1 className="text-3xl font-black text-white mb-3 tracking-tight">This page didn&apos;t load</h1>
          <p className="text-neutral-500 mb-8">
            The problem is on our side, not yours. Trying again often works. Nothing you did has been lost.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={retry}>Try again</Button>
            <ButtonLink href="/" variant="secondary">Go home</ButtonLink>
          </div>
          {/* The digest is what ties this to a line in the server log. */}
          {error.digest && (
            <p className="mt-8 text-[11px] text-neutral-400 font-mono">Reference: {error.digest}</p>
          )}
        </div>
      </main>
    </div>
  )
}
