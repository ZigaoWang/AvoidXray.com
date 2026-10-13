'use client'

import { useState } from 'react'
import { Heart, useLike } from './ui/like'
import Modal from './ui/Modal'
import PeopleList from './PeopleList'
import { focusRing } from './ui/focus'

/**
 * Like, and who else did, on the photo page.
 *
 * The heart was the characters ♡ and ♥, drawn by whichever font on the
 * reader's machine claims them — a different weight, and often a different
 * color, from the outlined heart the grid uses for the same action. Both now
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
  const { liked, count, animating, toggle } = useLike(photoId, initialLiked, initialCount)
  const [showModal, setShowModal] = useState(false)

  const handleShowLikes = () => {
    if (count === 0) return
    setShowModal(true)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={liked}
          // The heart is 20px, so the button around it was a 20px target,
          // under the 24px minimum, for the main thing you do to a photograph.
          // Negative margin so a bigger hit area costs no layout.
          className={`-m-1.5 flex items-center gap-2 p-1.5 text-sm font-medium transition-colors ${focusRing}
                      ${liked ? 'text-brand' : 'text-neutral-400 hover:text-white'}`}
        >
          <Heart filled={liked} className={`h-5 w-5 ${animating ? 'animate-heart-pop' : ''}`} />
          {/* Worded, rather than a bare glyph with no name beside it. A 20px
              gray outline was the quietest thing in a card whose loudest was
              "Download with Watermark", so the screen asked hardest for the
              action that takes something away. The state is aria-pressed and
              the filled red heart, which is why the word does not change:
              nothing announces "Liked" twice. */}
          Like
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
              ? `text-neutral-400 hover:text-white ${focusRing}`
              : 'text-neutral-600'
          }`}
        >
          {count}
        </button>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Liked by">
        <div className="max-h-96 overflow-y-auto">
          {showModal && (
            <PeopleList
              url={`/api/likes?photoId=${encodeURIComponent(photoId)}`}
              emptyMessage="No likes yet"
              onNavigate={() => setShowModal(false)}
            />
          )}
        </div>
      </Modal>
    </>
  )
}
