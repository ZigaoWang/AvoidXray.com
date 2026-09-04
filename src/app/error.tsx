'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * What a reader sees when a page throws.
 *
 * There was no error boundary at the route level, so an unhandled server error
 * fell through to Next's own page: an unstyled message on a white background,
 * with no way back into the site. This keeps people inside it and offers the
 * one thing that usually works — trying again.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[page error]', error)
  }, [error])

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[#D32F2F] text-xs uppercase tracking-wide font-bold mb-3">Something went wrong</p>
        <h1 className="text-3xl font-black text-white mb-3 tracking-tight">This page didn&apos;t load</h1>
        <p className="text-neutral-500 mb-8">
          The problem is on our side, not yours. Trying again often works. Nothing you did has been lost.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center h-10 px-5 text-sm uppercase tracking-wide font-bold
                       bg-[#D32F2F] text-white hover:bg-[#B71C1C] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-5 text-sm uppercase tracking-wide font-bold
                       bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
          >
            Go home
          </Link>
        </div>
        {/* The digest is what ties this to a line in the server log. */}
        {error.digest && (
          <p className="mt-8 text-[11px] text-neutral-700 font-mono">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
