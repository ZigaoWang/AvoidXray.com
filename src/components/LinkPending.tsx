'use client'

import { useLinkStatus } from 'next/link'

/**
 * Marks the link you just clicked until its page arrives.
 *
 * Photo, profile, film and camera pages have no `loading.tsx` — a Suspense
 * fallback commits the response to 200, which would turn a missing photograph
 * into "not found" under a success status. Without one, a click shows nothing
 * for the length of the round trip.
 *
 * Render inside the `<Link>` it reports on; the hook reads the nearest one.
 */
export default function LinkPending({ className }: { className: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <>
      <span aria-hidden className={className} />
      <span role="status" className="sr-only">Loading</span>
    </>
  )
}
