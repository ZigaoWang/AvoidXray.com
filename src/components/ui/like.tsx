'use client'

import { useCallback, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from './Toast'
import { apiErrorMessage } from '@/lib/apiError'

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

/** The heart, drawn rather than typed, so it is the same shape everywhere. */
export function Heart({ filled, className = '' }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? '#D32F2F' : 'none'}
      stroke={filled ? '#D32F2F' : 'currentColor'}
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
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [animating, setAnimating] = useState(false)
  const [busy, setBusy] = useState(false)

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
    setLiked(next)
    setCount(c => Math.max(0, next ? c + 1 : c - 1))
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
    } catch (error) {
      // Put the button back where it was. An optimistic update that is never
      // reconciled is a lie the reader only discovers on the next page load.
      setLiked(!next)
      setCount(c => Math.max(0, next ? c - 1 : c + 1))
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
