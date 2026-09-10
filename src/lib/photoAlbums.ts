import { prisma } from '@/lib/db'
import { visibleToViewer } from '@/lib/photoVisibility'

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
      // The count a stranger sees excludes the owner's private frames, so the
      // number on this card and the number on the album page agree.
      _count: { select: { photos: { where: { photo: visibleToViewer(viewerId) } } } },
    },
    // Oldest first, so the card does not reshuffle as albums are created.
    orderBy: { createdAt: 'asc' },
  })

  return albums.map((album) => ({
    id: album.id,
    name: album.name,
    public: album.public,
    photoCount: album._count.photos,
  }))
}
