import { prisma } from '@/lib/db'
import { visiblePhotoCountsByAlbum } from '@/lib/counts'

/**
 * The albums a photo belongs to, as far as one viewer is concerned.
 *
 * The photo page used to say which albums held a photo, and lost the card when
 * the legacy /collections feature was removed — albums share the Collection
 * model, so the block went with it. What was left was `albumId` in the query
 * string, which only exists when you arrived from an album page: follow a
 * shared link or a search result and the photo claimed to belong to nothing.
 *
 * A private album is its owner's alone, the same rule /albums/[id] and the API
 * apply. Every album holding a photo belongs to that photo's owner — album
 * writes refuse ids the caller does not own (see resolveOwnedPhotoIds) — so
 * `userId: viewerId` here means exactly "you are the photographer".
 */

export interface PhotoAlbum {
  id: string
  name: string
  public: boolean
  /** Photos in the album this viewer can see, matching what /albums/[id] lists. */
  photoCount: number
}

export async function albumsForPhoto(
  photoId: string,
  viewerId: string | null | undefined
): Promise<PhotoAlbum[]> {
  const albums = await prisma.collection.findMany({
    where: {
      photos: { some: { photoId } },
      OR: [{ public: true }, ...(viewerId ? [{ userId: viewerId }] : [])],
    },
    select: {
      id: true,
      name: true,
      public: true,
    },
    // Oldest first, so the card does not reshuffle as albums are created.
    orderBy: { createdAt: 'asc' },
  })

  // This runs on every photo page view, so the count stays out of the findMany
  // (see src/lib/counts.ts). It is still the count for this viewer: a stranger
  // does not see the owner's private frames here either.
  const photoCounts = await visiblePhotoCountsByAlbum(
    albums.map((album) => album.id),
    viewerId
  )

  return albums.map((album) => ({
    id: album.id,
    name: album.name,
    public: album.public,
    photoCount: photoCounts.get(album.id) ?? 0,
  }))
}
