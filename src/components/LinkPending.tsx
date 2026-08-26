'use client'

import { useLinkStatus } from 'next/link'

/**
 * Marks the link you just clicked, until its page arrives.
 *
 * Photo, profile, film and camera pages are all dynamic and none of them has a
 * `loading.tsx` — they cannot have one, because a Suspense fallback commits the
 * response to 200 and a missing photograph then returns "not found" under a
 * success status. The server renders these pages in about 40ms, so nothing here
 * is slow; the wait is the round trip, and from outside Hong Kong that is half
 * a second of a click doing nothing visible.
 *
 * So the feedback goes on the thing you clicked rather than in a bar at the top
 * of the window: on a page that is a grid of near-identical photographs, which
 * one you picked is the part worth confirming.
 *
 * Must be rendered inside the `<Link>` it reports on — the hook reads the
 * nearest one.
 */
export default function LinkPending({ className }: { className: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <>
      <span aria-hidden className={className} />
      {/* The underline is invisible to a screen reader, so say it instead. */}
      <span role="status" className="sr-only">Loading</span>
    </>
  )
}
