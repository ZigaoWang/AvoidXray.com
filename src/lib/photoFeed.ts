import { Prisma } from '@prisma/client'

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
 * instead of serialising every photo into the initial payload.
 */
export interface FeedScope {
  filmStockId?: string
  cameraId?: string
  username?: string
  albumId?: string
}

export function parseFeedScope(params: URLSearchParams): FeedScope {
  const scope: FeedScope = {}
  const filmStockId = params.get('filmStockId')
  const cameraId = params.get('cameraId')
  const username = params.get('username')
  const albumId = params.get('albumId')
  if (filmStockId) scope.filmStockId = filmStockId
  if (cameraId) scope.cameraId = cameraId
  if (username) scope.username = username
  if (albumId) scope.albumId = albumId
  return scope
}

/** Serialises a scope back into query parameters for the client to send. */
export function feedScopeQuery(scope: FeedScope): string {
  const params = new URLSearchParams()
  if (scope.filmStockId) params.set('filmStockId', scope.filmStockId)
  if (scope.cameraId) params.set('cameraId', scope.cameraId)
  if (scope.username) params.set('username', scope.username)
  if (scope.albumId) params.set('albumId', scope.albumId)
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
  scope: FeedScope = {}
): Prisma.PhotoWhereInput {
  const where: Prisma.PhotoWhereInput =
    tab === 'following'
      ? { published: true, userId: { in: followingIds } }
      : { published: true }

  if (scope.filmStockId) where.filmStockId = scope.filmStockId
  if (scope.cameraId) where.cameraId = scope.cameraId
  if (scope.username) where.user = { username: scope.username }
  // Album membership lives on the join table.
  if (scope.albumId) where.collections = { some: { collectionId: scope.albumId } }

  return where
}
