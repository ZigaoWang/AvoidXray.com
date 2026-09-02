'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, useLike } from './ui/like'

interface LikedUser { username: string; name: string | null; avatar: string | null }

/**
 * Like, and who else did, on the photo page.
 *
 * The heart was the characters ♡ and ♥, drawn by whichever font on the
 * reader's machine claims them — a different weight, and often a different
 * colour, from the outlined heart the grid uses for the same action. Both now
 * come from one component.
 */
export default function LikeButton({
  photoId,
  initialLiked,
  initialCount,
}: {
  photoId: string
  initialLiked: boolean
  initialCount: number
}) {
  const { liked, count, animating, toggle, label } = useLike(photoId, initialLiked, initialCount)
  const [showModal, setShowModal] = useState(false)
  const [likedBy, setLikedBy] = useState<LikedUser[]>([])
  const [loadingModal, setLoadingModal] = useState(false)
  const [failed, setFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  // Escape closes it, the page behind stays put, and focus moves into the
  // dialog and back to the control that opened it. None of that was here: the
  // overlay could only be dismissed with a pointer, and a keyboard user who
  // opened it was left tabbing through the page underneath it.
  useEffect(() => {
    if (!showModal) {
      openerRef.current?.focus()
      return
    }
    closeRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false) }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [showModal])

  const handleShowLikes = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (count === 0) return
    openerRef.current = e.currentTarget
    setShowModal(true)
    setLoadingModal(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/likes?photoId=${photoId}`)
      // A failed request used to leave an empty list under a "Liked by"
      // heading, which reads as "nobody" on a photo that plainly has likes.
      if (!res.ok) throw new Error()
      setLikedBy(await res.json())
    } catch {
      setFailed(true)
    } finally {
      setLoadingModal(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-pressed={liked}
          className={`transition-colors focus-visible:outline focus-visible:outline-1
                      focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]
                      ${liked ? 'text-[#D32F2F]' : 'text-neutral-500 hover:text-white'}`}
        >
          <Heart filled={liked} className={`h-5 w-5 ${animating ? 'animate-heart-pop' : ''}`} />
        </button>
        <button
          type="button"
          onClick={handleShowLikes}
          // Disabled rather than given a cursor hint: at zero it does nothing,
          // and a focusable control that does nothing is a dead stop on the
          // way through the page.
          disabled={count === 0}
          aria-label={count === 0 ? 'No likes yet' : `See who liked this — ${count}`}
          className={`text-sm tabular-nums transition-colors ${
            count > 0
              ? 'text-neutral-400 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]'
              : 'text-neutral-600'
          }`}
        >
          {count}
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="liked-by-title"
            className="w-full max-w-sm border border-neutral-800 bg-neutral-900 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <h2 id="liked-by-title" className="text-sm font-bold text-white">Liked by</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close"
                className="text-neutral-500 transition-colors hover:text-white focus-visible:outline
                           focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loadingModal ? (
                <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
              ) : failed ? (
                <p className="py-8 text-center text-sm text-neutral-500">Could not load this just now.</p>
              ) : likedBy.map(u => (
                <Link key={u.username} href={`/${u.username}`} onClick={() => setShowModal(false)}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-800">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-neutral-700 text-sm font-bold">
                    {u.avatar ? <Image src={u.avatar} alt="" width={36} height={36} className="h-full w-full object-cover" /> : (u.name || u.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{u.name || u.username}</p>
                    <p className="truncate text-xs text-neutral-500">@{u.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
