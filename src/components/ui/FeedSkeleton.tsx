import { Skeleton } from './Skeleton'

/**
 * Stand-in for a masonry feed while the server renders one.
 *
 * These routes take around half a second to respond. Without a loading state
 * an App Router navigation shows the *previous* page, unchanged, for that whole
 * time — so a tap reads as having done nothing, and people tap again. Varying
 * the tile heights keeps it looking like the grid it precedes rather than a
 * block of identical rectangles.
 */
const HEIGHTS = ['h-56', 'h-72', 'h-64', 'h-80', 'h-60', 'h-72', 'h-52', 'h-68']

export default function FeedSkeleton({ count = 12, columns = 4 }: { count?: number; columns?: number }) {
  return (
    <div
      aria-hidden
      className="flex gap-4"
      style={{ ['--cols' as string]: columns }}
    >
      {Array.from({ length: columns }).map((_, col) => (
        <div key={col} className="flex-1 flex flex-col gap-4">
          {Array.from({ length: Math.ceil(count / columns) }).map((_, row) => (
            <Skeleton key={row} className={HEIGHTS[(col + row * columns) % HEIGHTS.length]} />
          ))}
        </div>
      ))}
    </div>
  )
}
