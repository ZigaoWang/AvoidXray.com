'use client'

import { Heart, useLike } from './ui/like'

/**
 * The like control on a grid tile.
 *
 * It used to be `opacity-0 group-hover:opacity-100`, which on a phone meant an
 * invisible but fully live button sitting over the top-right corner of every
 * photograph: nothing to see, and a tap near the corner liked the picture
 * without ever showing that it had. It is drawn on any device without hover,
 * and still reveals on hover where there is one.
 *
 * It also had no accessible name and no pressed state, so it read to a screen
 * reader as an unlabelled button on each of a hundred tiles.
 */
export default function QuickLikeButton({
  photoId,
  initialLiked,
  initialCount,
}: {
  photoId: string
  initialLiked: boolean
  initialCount: number
}) {
  const { liked, count, animating, toggle, label } = useLike(photoId, initialLiked, initialCount)

  return (
    <button
      type="button"
      onClick={e => {
        // The tile is a link to the photo; liking it is not a request to go
        // there.
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }}
      aria-label={label}
      aria-pressed={liked}
      className="absolute top-1 right-1 flex h-9 items-center gap-1 px-1.5 text-white
                 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity
                 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1
                 focus-visible:outline-white
                 opacity-100 [@media(hover:hover)]:opacity-0
                 [@media(hover:hover)]:group-hover:opacity-100
                 [@media(hover:hover)]:group-focus-within:opacity-100
                 [@media(hover:hover)]:focus-visible:opacity-100"
    >
      <Heart filled={liked} className={`h-5 w-5 ${animating ? 'animate-heart-pop' : ''}`} />
      {count > 0 && <span className="text-xs font-semibold tabular-nums">{count}</span>}
    </button>
  )
}
