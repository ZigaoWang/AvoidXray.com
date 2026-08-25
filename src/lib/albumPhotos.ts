import { prisma } from '@/lib/db'

/**
 * Validation for the photo ids a caller wants to put in an album.
 *
 * Album writes took `photoIds` straight from the request body into a nested
 * CollectionPhoto create, so any id was accepted — including someone else's.
 * That was enough on its own to place another person's PRIVATE photo into an
 * album, and a public album renders what it contains, so the photo became
 * visible to strangers without its owner ever touching a visibility control.
 *
 * Ownership is the right boundary here rather than "can you see it": an album
 * is a collection of your own work, and being able to see a public photo is
 * not a reason to be able to file it under your name.
 */

/**
 * Upper bound on ids accepted in one request.
 *
 * Keeps a single call from turning into an unbounded `IN (...)` and an
 * unbounded nested write. Comfortably above a full roll, which is the largest
 * batch the upload flow produces.
 */
export const MAX_ALBUM_PHOTO_IDS = 500

export interface OwnedPhotoIds {
  /** Ids the caller owns, de-duplicated, in the order supplied. */
  ids: string[]
  /** How many supplied ids were not the caller's. Non-zero means refuse. */
  rejected: number
}

/**
 * Narrows arbitrary request input to the photo ids `userId` owns.
 *
 * Anything that is not a non-empty string is discarded before the query, so a
 * malformed body cannot reach Prisma and surface as a 500.
 */
export async function resolveOwnedPhotoIds(
  input: unknown,
  userId: string
): Promise<OwnedPhotoIds> {
  if (!Array.isArray(input)) return { ids: [], rejected: 0 }

  const requested = [...new Set(input.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (requested.length === 0) return { ids: [], rejected: 0 }

  const capped = requested.slice(0, MAX_ALBUM_PHOTO_IDS)

  const owned = await prisma.photo.findMany({
    where: { id: { in: capped }, userId },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((p) => p.id))

  return {
    // Filtering `capped` rather than returning the query's own order preserves
    // the sequence the caller chose, which is what the album's `order` records.
    ids: capped.filter((id) => ownedIds.has(id)),
    rejected: requested.length - ownedIds.size,
  }
}

/** The message shown when a request names photos the caller does not own. */
export const NOT_YOUR_PHOTOS = 'You can only add your own photos to an album.'
