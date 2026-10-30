import type { MouseEvent, ReactNode } from 'react'
import { focusRing } from '@/components/ui/focus'

/**
 * The grid selectable tiles sit in. Row major, and deliberately not the
 * masonry the public wall uses: CSS columns flow down the first column and then
 * the second, so a shift-clicked range would take a column rather than the run
 * anybody could see. Here the order is the interface.
 */
export const TILE_GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6'

/**
 * The one control a tile carries in its top right corner: open the photo,
 * remove the file. Drawn on any device without hover, revealed on hover or
 * focus where there is one.
 */
export const tileCornerClass =
  'absolute top-0.5 right-0.5 z-10 grid h-9 w-9 place-items-center text-white ' +
  'drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity ' +
  'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ' +
  `[@media(hover:hover)]:group-focus-within:opacity-100 disabled:invisible ${focusRing}`

/**
 * A photo that can be picked: Your photos, the upload grid, the library, an
 * import, the Trash.
 *
 * Selection is a white ring and a filled box in the corner, never brand red:
 * red is kept for the one action a screen wants. The whole tile is the
 * select control; anything else on it (the corner control, a retry) is its
 * own button above it.
 */
export default function SelectableTile({
  selected,
  onSelect,
  label,
  image,
  corner,
  badges,
  overlay,
  below,
  dimmed = false,
  photoId,
}: {
  selected: boolean
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void
  /** What a screen reader hears: the label replaces the tile's contents. */
  label: string
  /** The picture, filling the square. */
  image: ReactNode
  corner?: ReactNode
  /** Small states in the bottom left: Private, Draft, Held. */
  badges?: ReactNode
  /** Over the whole frame: progress, a spinner, an error strip. */
  overlay?: ReactNode
  /** A line under the tile, for what needs words. */
  below?: ReactNode
  /** Skipped or refused: still shown, drawn back. */
  dimmed?: boolean
  /** For a drag-select box to find the tile. */
  photoId?: string
}) {
  return (
    <div className={dimmed ? 'opacity-50' : undefined} data-photo-id={photoId}>
      <div
        className={`group relative aspect-square overflow-hidden bg-neutral-900 transition-all ${
          selected ? 'ring-2 ring-white' : 'hover:opacity-80'
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={label}
          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-[-2px] focus-visible:outline-white"
        />
        <div className="pointer-events-none absolute inset-0">{image}</div>

        <span
          className={`pointer-events-none absolute top-1.5 left-1.5 z-10 grid h-5 w-5 place-items-center border transition-colors ${
            selected ? 'bg-white border-white' : 'bg-black/40 border-white/50'
          }`}
          aria-hidden
        >
          {selected && (
            <svg className="h-3 w-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>

        {corner}
        {overlay}
        {badges && (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 flex flex-wrap items-end gap-1">
            {badges}
          </span>
        )}
      </div>
      {below}
    </div>
  )
}
