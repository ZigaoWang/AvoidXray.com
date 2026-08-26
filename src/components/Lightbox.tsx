'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { blurHashToDataURL } from '@/lib/blurhash'

interface LightboxProps {
  /** This photo's id, so a pending reopen can be matched to it precisely. */
  photoId: string
  src: string
  alt: string
  /** The real pixel size. Without it the placeholder is always 3:2 landscape. */
  width: number
  height: number
  prevId?: string | null
  /** Query string that keeps navigation inside the same list. */
  navSuffix?: string
  nextId?: string | null
  blurHash?: string | null
}

/**
 * Holds the id of the photo the lightbox should open on, set just before
 * moving to an adjacent frame. Without it, swiping or arrowing to the next
 * photo drops the viewer back to the page behind — which makes browsing a roll
 * full-screen impossible on a phone.
 *
 * The id is stored rather than a bare flag so a stale value cannot pop the
 * lightbox open on an unrelated photo later. sessionStorage rather than the
 * URL: transient view state, not something worth putting in a shared link.
 */
const REOPEN_KEY = 'lightbox-reopen-photo'

/** The snapshot never changes without a render, so no subscription is needed. */
const subscribeNever = () => () => {}

/** Horizontal travel that counts as a swipe rather than a tap or a scroll. */
const SWIPE_THRESHOLD_PX = 50

export default function Lightbox({ photoId, src, alt, width, height, prevId, nextId, blurHash, navSuffix = '' }: LightboxProps) {
  // Read during render rather than assigned from an effect: setting state in an
  // effect to match external storage causes a second render pass, and on a
  // slow connection that shows the page behind before the overlay appears.
  // useSyncExternalStore gives the server a definite `false` so hydration
  // cannot mismatch.
  const reopenPending = useSyncExternalStore(
    subscribeNever,
    () => sessionStorage.getItem(REOPEN_KEY) === photoId,
    () => false
  )
  // null means "not yet decided by the viewer", so the pending reopen wins.
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? reopenPending
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // The element that had focus before opening, so it can be given back.
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const goTo = useCallback(
    (id: string) => {
      sessionStorage.setItem(REOPEN_KEY, id)
      // Client-side: the previous version assigned window.location.href, which
      // threw away the whole app shell to move between two adjacent photos.
      router.push(`/photos/${id}${navSuffix}`)
    },
    [router, navSuffix]
  )

  const close = useCallback(() => {
    setOverride(false)
    // Clearing it here too, so backing out of the lightbox and returning later
    // does not reopen it unasked.
    sessionStorage.removeItem(REOPEN_KEY)
  }, [])

  // Prefetch the neighbours so browsing feels immediate rather than waiting on
  // a request that only starts when the arrow is pressed.
  useEffect(() => {
    if (!open) return
    if (prevId) router.prefetch(`/photos/${prevId}${navSuffix}`)
    if (nextId) router.prefetch(`/photos/${nextId}${navSuffix}`)
  }, [open, prevId, nextId, navSuffix, router])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        return
      }
      if (e.key === 'ArrowLeft' && prevId) goTo(prevId)
      if (e.key === 'ArrowRight' && nextId) goTo(nextId)

      // Keep Tab inside the dialog. Without this, tabbing walks into the page
      // behind the overlay, which cannot be seen or scrolled to.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, [href]')
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, prevId, nextId, goTo, close])

  // Focus moves into the dialog on open and returns to the trigger on close,
  // so a keyboard or screen-reader user is not left where the overlay is not.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement
      closeButtonRef.current?.focus()
    } else {
      previouslyFocused.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return

    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y

    // Only a decisively horizontal gesture counts, so a vertical drag or an
    // imprecise tap is not mistaken for a request to change photo.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0 && prevId) goTo(prevId)
    if (dx < 0 && nextId) goTo(nextId)
  }

  // Square surfaces on the site's neutral palette. The buttons elsewhere carry
  // no corner radius at all, and rounded-full is reserved for avatars and
  // spinners, so pills here would have read as borrowed from another site.
  const chromeClass =
    'grid place-items-center bg-neutral-900/80 border border-neutral-800 text-neutral-400 ' +
    'backdrop-blur transition-colors hover:text-white hover:border-neutral-600 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]'

  const arrowClass = `absolute top-1/2 -translate-y-1/2 h-12 w-12 sm:h-14 sm:w-14 ${chromeClass}`

  return (
    <>
      <button
        onClick={() => setOverride(true)}
        className="absolute inset-0 cursor-zoom-in"
        aria-label="View full size"
      />

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center overscroll-contain"
          onClick={close}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Tap targets sit clear of the notch and home indicator on phones. */}
          <button
            ref={closeButtonRef}
            onClick={close}
            className={`absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]
                        h-11 w-11 ${chromeClass}`}
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {prevId && (
            <button
              onClick={e => { e.stopPropagation(); goTo(prevId) }}
              className={`${arrowClass} left-[max(0.5rem,env(safe-area-inset-left))]`}
              aria-label="Previous photo"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {nextId && (
            <button
              onClick={e => { e.stopPropagation(); goTo(nextId) }}
              className={`${arrowClass} right-[max(0.5rem,env(safe-area-inset-right))]`}
              aria-label="Next photo"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Sized by the photo's own ratio. width/height were hardcoded to
              1920x1280, so next/image reserved a 3:2 landscape box and the blur
              placeholder filled it no matter what shape the photo actually was:
              a portrait frame blurred in as a wide rectangle, then snapped. */}
          <div
            className="relative w-full"
            style={{
              aspectRatio: `${width} / ${height}`,
              maxWidth: `min(92vw, calc(88vh * ${width} / ${height}))`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={src}
              alt={alt}
              fill
              sizes="92vw"
              className="object-contain"
              priority
              placeholder={blurHash ? 'blur' : 'empty'}
              blurDataURL={blurHashToDataURL(blurHash)}
            />
          </div>

          {/* Stated once, plainly, in the same uppercase micro-type the nav
              and buttons use. The wording follows the pointer, because a phone
              has no Esc key and a mouse cannot swipe — and it is only offered
              when there is actually somewhere to go. This previously animated
              itself away, which nothing else on the site does. */}
          <div
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0
                       flex justify-center pointer-events-none px-4"
          >
            <p className="text-[11px] uppercase tracking-wide font-medium text-neutral-500">
              <span className="[@media(pointer:coarse)]:hidden">
                {prevId || nextId ? 'Esc to close · Arrow keys to browse' : 'Esc to close'}
              </span>
              <span className="hidden [@media(pointer:coarse)]:inline">
                {prevId || nextId ? 'Tap to close · Swipe to browse' : 'Tap to close'}
              </span>
            </p>
          </div>

        </div>
      )}
    </>
  )
}
