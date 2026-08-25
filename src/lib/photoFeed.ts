import { Prisma } from '@prisma/client'
import { utcDayRange } from './profileFeed'
import { PUBLIC_PHOTO } from './photoVisibility'
import type { Photo } from '@prisma/client'

/**
 * Ordering and filtering for the explore feed.
 *
 * This lives in one place because it previously did not: the page rendered the
 * first screen and /api/photos rendered every screen after it, each with its own
 * copy of the logic. They drifted, so the "popular" tab was ordered by date on
 * the first screen and by likes on the rest — the two orderings disagree, and
 * MasonryGrid's dedupe silently dropped every photo that appeared in both.
 */

/**
 * Photos rendered by the server before the grid takes over paging. Matches the
 * batch size MasonryGrid fetches, so the first scroll behaves like every later
 * one.
 */
export const FEED_FIRST_PAGE = 30

export type FeedTab = 'random' | 'recent' | 'popular' | 'following'

export function isFeedTab(value: string | undefined): value is FeedTab {
  return value === 'random' || value === 'recent' || value === 'popular' || value === 'following'
}

/**
 * Ordering for the tabs served through Prisma.
 *
 * Every ordering ends with a unique-ish tiebreaker. Without one, `popular` sorts
 * 786 photos that all have zero likes into an order Postgres is free to vary
 * between queries, which makes offset pagination duplicate and skip rows.
 * `createdAt` then `id` gives a total order that is stable across requests.
 */
export function feedOrderBy(tab: FeedTab): Prisma.PhotoOrderByWithRelationInput[] {
  switch (tab) {
    case 'popular':
      return [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]
    case 'recent':
    case 'following':
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }]
  }
}

/**
 * Narrows a feed to one film stock, camera, photographer or album.
 *
 * Lets the hub pages page their grids through /api/photos the way explore does,
 * instead of serializing every photo into the initial payload.
 */
export interface FeedScope {
  filmStockId?: string
  cameraId?: string
  username?: string
  albumId?: string
  /** UTC calendar day, YYYY-MM-DD — the profile heatmap's day filter. */
  day?: string
}

export function parseFeedScope(params: URLSearchParams): FeedScope {
  const scope: FeedScope = {}
  const filmStockId = params.get('filmStockId')
  const cameraId = params.get('cameraId')
  const username = params.get('username')
  const albumId = params.get('albumId')
  const day = params.get('day')
  if (filmStockId) scope.filmStockId = filmStockId
  if (cameraId) scope.cameraId = cameraId
  if (username) scope.username = username
  if (albumId) scope.albumId = albumId
  if (day) scope.day = day
  return scope
}

/** Serializes a scope back into query parameters for the client to send. */
export function feedScopeQuery(scope: FeedScope): string {
  const params = new URLSearchParams()
  if (scope.filmStockId) params.set('filmStockId', scope.filmStockId)
  if (scope.cameraId) params.set('cameraId', scope.cameraId)
  if (scope.username) params.set('username', scope.username)
  if (scope.albumId) params.set('albumId', scope.albumId)
  if (scope.day) params.set('day', scope.day)
  const query = params.toString()
  return query ? `&${query}` : ''
}

/**
 * `following` needs the viewer's follow list; every other tab shows everything
 * published. An empty follow list must still yield an empty feed rather than
 * falling through to "all photos".
 */
export function feedWhere(
  tab: FeedTab,
  followingIds: string[],
  scope: FeedScope = {},
  /**
   * Set only when the caller has established that this feed belongs to the
   * viewer — their own profile, or an album they own. Their private photos are
   * then included, so a private photo in no album is still reachable by the
   * person who took it. Left unset everywhere else, which keeps explore and
   * every stranger-facing feed strictly public.
   */
  ownerViewingId?: string | null
): Prisma.PhotoWhereInput {
  // PUBLIC_PHOTO rather than a bare `published`, so a private photo never
  // reaches explore or any scoped feed built on this.
  const visible: Prisma.PhotoWhereInput = ownerViewingId
    ? { published: true, OR: [{ visibility: 'PUBLIC' }, { userId: ownerViewingId }] }
    : { ...PUBLIC_PHOTO }

  const where: Prisma.PhotoWhereInput =
    tab === 'following'
      ? { ...visible, userId: { in: followingIds } }
      : { ...visible }

  if (scope.filmStockId) where.filmStockId = scope.filmStockId
  if (scope.cameraId) where.cameraId = scope.cameraId
  if (scope.username) where.user = { username: scope.username }
  // Album membership lives on the join table.
  if (scope.albumId) where.collections = { some: { collectionId: scope.albumId } }
  if (scope.day) {
    const range = utcDayRange(scope.day)
    // An unparseable day yields no photos rather than silently showing all of
    // them, which would look like the filter had been ignored.
    where.createdAt = range ?? { lt: new Date(0) }
  }

  return where
}

/**
 * A row from the random-tab raw query, used by both /explore and /api/photos.
 *
 * The random tab orders by a seeded md5 of the photo id, which Prisma cannot
 * express, so it runs as raw SQL. `p.*` is a full Photo and the relations come
 * back as json_build_object results, so the shape has to be declared rather
 * than inferred from a Prisma include.
 */
export type RandomFeedRow = Photo & {
  user: { username: string; name: string | null; avatar: string | null } | null
  filmStock: { name: string; brand: string | null; slug: string | null } | null
  camera: { name: string; brand: string | null; slug: string | null } | null
  likes_count: number
}
