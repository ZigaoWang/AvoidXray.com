import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { PreviewPhoto } from '@/lib/previewPhotos'
import { blurPlaceholder, BLUR_SIZE, CARD_PREVIEW_BLUR_COUNT } from '@/lib/blurhash'
import { PhotoIcon } from '@/components/ui/EmptyState'

/** How many frames the strip across the top of a card shows. */
const PREVIEW_TILES = 4

/**
 * An album in a grid of them.
 *
 * There were two copies of this — /discover/albums and /albums — that had
 * already drifted: one gave its preview tiles descriptive alt text and the
 * other an empty string, one budgeted its blur placeholders and the other
 * decoded four per card however long the page was. Search needed a third.
 *
 * The parts that genuinely differ between surfaces are the parts passed in:
 * the visibility badge belongs only where you are looking at your own albums,
 * the byline only where the album is somebody else's, and the three-dot menu
 * only where you can act on it.
 */
export default function AlbumCard({
  album,
  previews,
  photoCount,
  cardIndex,
  as: Heading = 'h2',
  badge,
  byline,
  actions,
}: {
  album: { id: string; name: string; description?: string | null }
  previews: PreviewPhoto[]
  photoCount: number
  /** Position in its grid, which is what the blur budget is spent by. */
  cardIndex: number
  /** The heading level this sits at on the page using it. */
  as?: 'h2' | 'h3'
  /** Public / Private, on the surfaces where the reader set it. */
  badge?: ReactNode
  /** Who made it, on the surfaces showing other people's albums. */
  byline?: ReactNode
  /** The menu, on the surfaces where the reader owns it. */
  actions?: ReactNode
}) {
  const tiles = previews.slice(0, PREVIEW_TILES)

  return (
    <div className="group relative overflow-hidden border border-neutral-800 bg-neutral-900 transition-colors hover:border-brand">
      <Link href={`/albums/${album.id}`}>
        <div className="grid grid-cols-4 gap-px bg-neutral-800">
          {tiles.map((photo, previewIndex) => (
            <div key={photo.id} className="relative aspect-square bg-neutral-900">
              <Image
                src={photo.thumbnailPath}
                alt={`Film photograph from the album ${album.name}`}
                fill
                className="object-cover"
                sizes="100px"
                {...blurPlaceholder(
                  photo.blurHash,
                  cardIndex * PREVIEW_TILES + previewIndex,
                  CARD_PREVIEW_BLUR_COUNT,
                  BLUR_SIZE.tile
                )}
              />
            </div>
          ))}
          {/* Blank tiles for the rest of the row, so an album with one photo
              is the same height in the grid as one with forty. */}
          {Array.from({ length: Math.max(0, PREVIEW_TILES - tiles.length) }).map((_, i) => (
            <div
              key={i}
              className="flex aspect-square items-center justify-center bg-neutral-900 text-neutral-700"
            >
              <PhotoIcon size={6} />
            </div>
          ))}
        </div>

        <div className={`p-4 ${byline ? 'pb-2' : ''}`}>
          <div className="flex items-center gap-2">
            <Heading className="truncate text-lg font-bold transition-colors group-hover:text-brand">
              {album.name}
            </Heading>
            {badge}
          </div>
          {album.description && (
            <p className="mt-1 truncate text-sm text-neutral-500">{album.description}</p>
          )}
          <p className="mt-1 text-sm text-neutral-500">
            {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
          </p>
        </div>
      </Link>

      {byline}
      {actions}
    </div>
  )
}

/**
 * The photographer's name under a card, linked to their profile.
 *
 * Its own export rather than markup repeated at each call site, for the same
 * reason as the card: the two that existed had already drifted to different
 * avatar sizes.
 */
export function AlbumByline({
  user,
}: {
  user: { username: string; name: string | null; avatar: string | null }
}) {
  return (
    <Link
      href={`/${user.username}`}
      className="flex items-center gap-2 px-4 pb-4 transition-opacity hover:opacity-80"
    >
      {/* Square, like every other avatar on the site. */}
      <div className="flex h-5 w-5 items-center justify-center overflow-hidden bg-neutral-800 text-xs font-bold text-white">
        {user.avatar ? (
          <Image
            src={user.avatar}
            alt={`${user.name || user.username} avatar`}
            width={20}
            height={20}
            className="h-full w-full object-cover"
          />
        ) : (
          (user.name || user.username).charAt(0).toUpperCase()
        )}
      </div>
      <span className="text-sm text-neutral-400 transition-colors hover:text-white">
        @{user.username}
      </span>
    </Link>
  )
}
