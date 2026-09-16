import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { visibleToViewer } from '@/lib/photoVisibility'

/**
 * The counts Prisma's `_count` cannot produce at a sane price.
 *
 * `_count: { select: { likes: true } }` inside a findMany does not compile to a
 * correlated subquery. Prisma emits an unrestricted `GROUP BY` over the whole
 * child table and LEFT JOINs the parent to it, and the parent's WHERE cannot be
 * pushed into that grouped subquery. So two things happen at once: every
 * request aggregates the entire child table, and the parent loses its index for
 * `ORDER BY ... LIMIT`, because the join input is no longer something the
 * planner can satisfy from an index. Measured on this schema at 100k photos and
 * 500k likes: 444ms with the `_count`, 0.074ms without it, for the same 31 rows.
 *
 * The shape of the fix is always the same — run the parent query without the
 * `_count`, then issue one `groupBy` restricted to the ids that came back, and
 * merge in JS. This module is the one place that shape lives, so the pages and
 * endpoints doing it can stay quiet about it. Each function short-circuits on an
 * empty id list rather than sending a query that can only return nothing.
 */

/** Photo ids to like counts. Photos with no likes are absent from the map. */
async function likeCountsFor(photoIds: string[]): Promise<Map<string, number>> {
  if (photoIds.length === 0) return new Map()

  // Served by Like's @@index([photoId]). Everything reaches this through
  // `withLikeCounts`, and those callers are all paged feeds, so the list is a
  // screen's worth: at most 51 from /api/photos (limit caps at 50, plus the
  // has-more probe) and 31 from the hub and profile first pages.
  const rows = await prisma.like.groupBy({
    by: ['photoId'],
    where: { photoId: { in: photoIds } },
    _count: { _all: true },
  })
  return new Map(rows.map((row) => [row.photoId, row._count._all]))
}

/**
 * The same photos, each carrying `_count: { likes: n }`.
 *
 * Returning the map and letting each site merge would mean touching every
 * consumer: MasonryGrid, ProfileTabs, LikeButton's initialCount and photoJsonLd
 * all read `photo._count.likes`, and /api/photos serializes the rows straight
 * to the client, so a different field name would be a wire format change. This
 * hands back the shape they already expect — and in the original order, which
 * is the feed's ordering and the only thing that decides what the grid shows
 * first.
 */
export async function withLikeCounts<T extends { id: string }>(
  photos: T[]
): Promise<(T & { _count: { likes: number } })[]> {
  const counts = await likeCountsFor(photos.map((photo) => photo.id))
  return photos.map((photo) => ({ ...photo, _count: { likes: counts.get(photo.id) ?? 0 } }))
}

/** Of these photos, the ones this viewer has already liked. */
async function viewerLikesFor(
  photoIds: string[],
  viewerId: string | null | undefined
): Promise<Set<string>> {
  if (!viewerId || photoIds.length === 0) return new Set()

  // Served by Like's unique on [userId, photoId]. Restricted to the ids that
  // came back rather than asking for everything this account has ever liked,
  // which grows without bound and is thrown away but for a screenful.
  const rows = await prisma.like.findMany({
    where: { userId: viewerId, photoId: { in: photoIds } },
    select: { photoId: true },
  })
  return new Set(rows.map((row) => row.photoId))
}

/**
 * The same photos, each carrying whether this viewer has liked it.
 *
 * Here rather than at each call site because it was at each call site, copied
 * into explore, both film pages, the camera page, the album page, the profile
 * and search — and then left out of /api/photos, which is the endpoint every
 * one of those pages scrolls through. So the first screen of a wall drew its
 * hearts correctly and everything below it came back unliked whatever the
 * table said, which reads as a like that did not save.
 *
 * Signed out, nothing is liked, and no query is sent to establish that.
 */
export async function withViewerLikes<T extends { id: string }>(
  photos: T[],
  viewerId: string | null | undefined
): Promise<(T & { liked: boolean })[]> {
  const mine = await viewerLikesFor(photos.map((photo) => photo.id), viewerId)
  return photos.map((photo) => ({ ...photo, liked: mine.has(photo.id) }))
}

/**
 * Shared by the two album counts below, which differ only in what they admit.
 *
 * Served by CollectionPhoto's @@index([collectionId]), joined to Photo when
 * there is a visibility test to apply. Bounded by the callers: 24 albums per
 * page on /discover/albums, one person's albums from GET /api/albums, and the
 * handful of albums holding one photo elsewhere.
 */
async function countByAlbum(
  albumIds: string[],
  photoScope: Prisma.PhotoWhereInput | null
): Promise<Map<string, number>> {
  if (albumIds.length === 0) return new Map()

  const rows = await prisma.collectionPhoto.groupBy({
    by: ['collectionId'],
    where: { collectionId: { in: albumIds }, ...(photoScope ? { photo: photoScope } : {}) },
    _count: { _all: true },
  })
  return new Map(rows.map((row) => [row.collectionId, row._count._all]))
}

/**
 * Album ids to the number of photos in them this viewer may see.
 *
 * A stranger's count must exclude the owner's private frames, so the number on
 * an album card and the number on the album page agree — and so a public album
 * does not advertise how much it is holding back.
 */
export function visiblePhotoCountsByAlbum(
  albumIds: string[],
  viewerId: string | null | undefined
): Promise<Map<string, number>> {
  return countByAlbum(albumIds, visibleToViewer(viewerId))
}

/**
 * Album ids to everything filed in them, whatever its visibility.
 *
 * For the owner's own list of albums, where a private frame — or a draft that
 * never finished publishing — is still something they put there and expect the
 * count to include.
 */
export function photoCountsByAlbum(albumIds: string[]): Promise<Map<string, number>> {
  return countByAlbum(albumIds, null)
}

/** The photo columns a catalog count can group on. */
type GearKey = 'cameraId' | 'filmStockId'

/**
 * Shared by the two functions below, which differ only in the column.
 *
 * `scope` is whatever photo filter the caller is already applying — PUBLIC_PHOTO
 * for a catalog page, visibleToViewer for a feed — and is ANDed rather than
 * spread so a scope that happens to name the gear column cannot silently
 * replace the id restriction.
 */
async function photoCountsByGear(
  key: GearKey,
  ids: string[],
  scope: Prisma.PhotoWhereInput
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()

  const rows = await prisma.photo.groupBy({
    by: [key],
    where: { AND: [scope, { [key]: { in: ids } }] },
    _count: { _all: true },
  })

  const counts = new Map<string, number>()
  for (const row of rows) {
    // The column is nullable on Photo, but `in` already excluded the nulls;
    // this is only here to narrow the type.
    const id = row[key]
    if (id !== null) counts.set(id, row._count._all)
  }
  return counts
}

/**
 * Camera ids to how many photos in `scope` were shot with each.
 *
 * Served by Photo's @@index([published, cameraId]). The callers cap their id
 * lists at 50 (search) or fewer (the related-gear lists on a hub page).
 */
export function photoCountsByCamera(
  cameraIds: string[],
  scope: Prisma.PhotoWhereInput
): Promise<Map<string, number>> {
  return photoCountsByGear('cameraId', cameraIds, scope)
}

/**
 * Film stock ids to how many photos in `scope` were shot on each.
 *
 * Served by Photo's @@index([published, filmStockId]). Bounded like the camera
 * version: 50 from search, fewer from a hub page.
 */
export function photoCountsByFilmStock(
  filmStockIds: string[],
  scope: Prisma.PhotoWhereInput
): Promise<Map<string, number>> {
  return photoCountsByGear('filmStockId', filmStockIds, scope)
}
