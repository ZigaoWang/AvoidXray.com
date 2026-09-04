'use client'

import { useState } from 'react'
import { Heart, useLike } from './ui/like'
import Modal, { UserRow } from './ui/Modal'

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

  const handleShowLikes = async () => {
    if (count === 0) return
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
          aria-haspopup="dialog"
          aria-label={count === 0 ? 'No likes yet' : `See who liked this, ${count}`}
          className={`text-sm tabular-nums transition-colors ${
            count > 0
              ? 'text-neutral-400 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]'
              : 'text-neutral-600'
          }`}
        >
          {count}
        </button>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Liked by">
        <div className="max-h-96 overflow-y-auto">
          {loadingModal ? (
            <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
          ) : failed ? (
            <p className="py-8 text-center text-sm text-neutral-500">Could not load this just now.</p>
          ) : likedBy.map(u => (
            <UserRow key={u.username} user={u} onNavigate={() => setShowModal(false)} />
          ))}
        </div>
      </Modal>
    </>
  )
}
