'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from './Toast'
import { apiErrorMessage } from '@/lib/apiError'
import { BRAND_RED } from '@/lib/constants'
import { likeTally } from '@/lib/likeState'

/**
 * Liking a photo, shared by the button on the photo page and the one on every
 * grid tile.
 *
 * The two had separate copies of this: separate optimistic updates, two
 * different hearts — an outlined SVG on the grid, the characters ♡ and ♥ on
 * the photo page, which render at whatever weight the reader's emoji font
 * feels like — and both discarded the response, so a like that the server
 * refused (rate limited, signed out in another tab, photo deleted) stayed
 * filled in on screen and was gone on the next load.
 */

/**
 * What this tab has done to its own likes, outside React.
 *
 * Every heart is drawn from whatever the page was rendered with, and a page is
 * rendered once. Next reuses a route's payload on browser back and forward —
 * "Pages are not cached by default but are reused during browser back/forward
 * navigation" — and restores the client state along with it, so liking a
 * photograph on its own page and returning to the wall showed the tile exactly
 * as it was before: heart empty, over a like the table had already accepted.
 *
 * A module scoped record survives both, because it is neither the payload nor
 * component state. It outlives any particular page, is read by every heart for
 * the same photograph at once, and holds only what this tab did — so two tiles
 * of one photo in the same feed can no longer disagree either.
 *
 * Cleared by a reload, which is correct: at that point the server has rendered
 * the truth and there is nothing left to remember.
 */
const mine = new Map<string, boolean>()

/** Per photograph, so one like does not re-render a wall of five hundred. */
const watchers = new Map<string, Set<() => void>>()

function remember(photoId: string, liked: boolean) {
  mine.set(photoId, liked)
  for (const notify of watchers.get(photoId) ?? []) notify()
}

/** The heart, drawn rather than typed, so it is the same shape everywhere. */
export function Heart({ filled, className = '' }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? BRAND_RED : 'none'}
      stroke={filled ? BRAND_RED : 'currentColor'}
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

export interface LikeState {
  liked: boolean
  count: number
  /** True for the length of the pop animation after a like. */
  animating: boolean
  /** Runs the toggle. Signed-out callers are sent to sign in and returned here. */
  toggle: () => void
  label: string
}

export function useLike(photoId: string, initialLiked: boolean, initialCount: number): LikeState {
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const [animating, setAnimating] = useState(false)
  const [busy, setBusy] = useState(false)

  const subscribe = useCallback((notify: () => void) => {
    let set = watchers.get(photoId)
    if (!set) { set = new Set(); watchers.set(photoId, set) }
    set.add(notify)
    return () => {
      set.delete(notify)
      if (set.size === 0) watchers.delete(photoId)
    }
  }, [photoId])

  // Undefined on the server and during hydration, which is always right: a full
  // load starts with an empty record, so the first client render matches the
  // markup and only a later like can make the two differ.
  const remembered = useSyncExternalStore(
    subscribe,
    useCallback(() => mine.get(photoId), [photoId]),
    () => undefined,
  )

  const { liked, count } = likeTally(initialLiked, initialCount, remembered)

  const toggle = useCallback(async () => {
    if (busy) return

    if (!session) {
      // Carries where they were, so signing in to like a photo does not also
      // cost them their place in the feed.
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname ?? '/')}`)
      return
    }

    const next = !liked
    setBusy(true)
    remember(photoId, next)
    if (next) {
      setAnimating(true)
      setTimeout(() => setAnimating(false), 300)
    }

    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      })
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not save that like'))

      // The endpoint toggles against the row that is actually in the table, so
      // its answer is the only authority on which way the heart ended up. A
      // second tab, or a page restored from the back-forward cache, sends its
      // toggle from a state the database has already left: the request
      // succeeds and lands on the opposite of what was drawn optimistically.
      const settled = await res.json().catch(() => null)
      const serverLiked = settled?.liked
      if (typeof serverLiked === 'boolean' && serverLiked !== next) remember(photoId, serverLiked)
    } catch (error) {
      // Put the button back where it was. An optimistic update that is never
      // reconciled is a lie the reader only discovers on the next page load.
      remember(photoId, !next)
      toast(error instanceof Error ? error.message : 'Could not save that like', 'error')
    } finally {
      setBusy(false)
    }
  }, [busy, session, router, pathname, liked, photoId, toast])

  return {
    liked,
    count,
    animating,
    toggle,
    label: liked ? 'Unlike this photo' : 'Like this photo',
  }
}
