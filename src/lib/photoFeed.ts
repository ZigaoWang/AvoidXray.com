import { Prisma } from '@prisma/client'
import { prisma } from './db'
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
 * The tab value an album grid sends.
 *
 * An album's sequence belongs to whoever arranged it, and it is recorded on
 * CollectionPhoto.order rather than on Photo, so no `feedOrderBy` can express
 * it and it is not a FeedTab. /api/photos pages an album by that order whatever
 * tab arrives; this constant exists so the grid sends something honest instead
 * of borrowing `recent`, which would page a curated album in date order.
 */
export const ALBUM_TAB = 'album'

/**
 * The columns an album's grid renders, shared by the page and /api/photos.
 *
 * Both callers select through here so the first screen and every screen after
 * it cannot drift: the geometry alone was enough to lay the tiles out, so every
 * photo in an album read "Film photograph" to a crawler while the same photo on
 * explore carried its gear and photographer. The four below `blurHash` are
 * exactly what `photoAlt` reads and nothing else — `manufacturer` is in the
 * list because `displayName` prefers it over brand for a film, and the user is
 * narrowed to the two fields the byline in the alt text is built from.
 */
const albumPhotoSelect = {
  id: true,
  thumbnailPath: true,
  mediumPath: true,
  width: true,
  height: true,
  blurHash: true,
  caption: true,
  filmStock: { select: { name: true, brand: true, manufacturer: true } },
  camera: { select: { name: true, brand: true } },
  user: { select: { name: true, username: true } },
} satisfies Prisma.PhotoSelect

export type AlbumFeedPhoto = Prisma.PhotoGetPayload<{ select: typeof albumPhotoSelect }>

/**
 * One page of an album, in the order its owner arranged.
 *
 * /albums/[id] renders the first screen and /api/photos serves every screen
 * after it, and both come through here for the same reason the tabs share
 * `feedOrderBy`: a second copy of this query is how an album would quietly
 * start paging in date order halfway down. `where` stays the caller's own photo
 * filter — the page's `visibleToViewer`, the endpoint's `feedWhere` — so this
 * adds no visibility rule of its own.
 */
export async function albumPhotoPage(
  albumId: string,
  where: Prisma.PhotoWhereInput,
  { skip = 0, take }: { skip?: number; take: number }
): Promise<AlbumFeedPhoto[]> {
  // Served by CollectionPhoto's @@index([collectionId]), joined to Photo for the
  // visibility test.
  const rows = await prisma.collectionPhoto.findMany({
    where: { collectionId: albumId, photo: where },
    // `order` carries the curated sequence but is not unique — it defaults to 0,
    // so an album filled before ordering existed has every row sitting at 0.
    // photoId breaks those ties the same way on every request, which is what
    // offset paging needs: an order Postgres is free to vary between queries
    // repeats and skips rows across pages.
    orderBy: [{ order: 'asc' }, { photoId: 'asc' }],
    skip,
    take,
    select: { photo: { select: albumPhotoSelect } },
  })
  return rows.map((row) => row.photo)
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
 * Whether the requested scope may be served to this viewer at all, and whose
 * private photos it may include.
 *
 * `owner` is the viewer's id when the scope is their own, which is what lets a
 * photographer see their own unpublished frames in their own feed.
 *
 * `allowed` is separate because an album is not only a filter, it is a thing
 * with its own visibility. /albums/[id] and /api/albums/[id] both 404 a private
 * album that is not yours; /api/photos did not, so anyone who had ever been
 * given the link could keep reading the album's photos and its total after it
 * was made private again — its exact composition, and the fact that it still
 * exists.
 *
 * Lives here rather than beside either caller because the photo page had its
 * own copy that answered the narrower question "does this viewer own the
 * scope". A private album someone else owned came back unowned rather than
 * refused, and prev/next walked its public frames in album order anyway.
 *
 * Verified against the database rather than trusted from the query string.
 */
export async function resolveScopeAccess(
  scope: FeedScope,
  viewerId: string | null | undefined
): Promise<{ allowed: boolean; owner: string | null }> {
  if (scope.albumId) {
    const album = await prisma.collection.findUnique({
      where: { id: scope.albumId },
      select: { userId: true, public: true },
    })
    // A missing album is refused the same way a private one is, so the
    // response cannot be used to tell them apart.
    if (!album) return { allowed: false, owner: null }
    const isOwner = !!viewerId && album.userId === viewerId
    return { allowed: album.public || isOwner, owner: isOwner ? viewerId! : null }
  }

  if (scope.username && viewerId) {
    const owner = await prisma.user.findUnique({
      where: { username: scope.username },
      select: { id: true },
    })
    return { allowed: true, owner: owner?.id === viewerId ? viewerId : null }
  }

  return { allowed: true, owner: null }
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
   * Accounts the viewer has blocked, or who have blocked them. Excluded from
   * every feed built on this, so one helper covers explore, the hub grids and
   * every scoped view rather than each remembering separately.
   */
  hiddenUserIds: string[] = [],
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

  // Both constraints go into one `userId` filter. Assigning the blocked list
  // separately would replace the follow list outright and quietly turn the
  // following tab into everybody.
  const userIdFilter: Prisma.StringFilter = {}
  if (tab === 'following') userIdFilter.in = followingIds
  if (hiddenUserIds.length > 0) userIdFilter.notIn = hiddenUserIds

  const where: Prisma.PhotoWhereInput = { ...visible }
  if (Object.keys(userIdFilter).length > 0) where.userId = userIdFilter
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
 * The same narrowing as `feedWhere`, as a SQL fragment for the random tab.
 *
 * The random tab cannot go through Prisma — it orders by a seeded md5 of the
 * photo id — so it hand-wrote its WHERE clause, and the two drifted. The raw
 * version covered film stock, camera and photographer but silently ignored
 * `day` and `albumId`, while the row count beside the grid came from
 * `feedWhere` and did account for them. The result was a filter that reported
 * "92 photos" above an unfiltered, unchanged grid.
 *
 * Expressed as a Record over every FeedScope key so the compiler refuses a new
 * key that is added to the scope and not handled here. That is the actual fix:
 * the bug was not a missing line, it was that nothing forced these two to agree.
 *
 * Assumes the query aliases Photo as `p` and User as `u`.
 */
const SCOPE_SQL: { [K in keyof Required<FeedScope>]: (value: string) => Prisma.Sql } = {
  filmStockId: (id) => Prisma.sql`p."filmStockId" = ${id}`,
  cameraId: (id) => Prisma.sql`p."cameraId" = ${id}`,
  username: (name) => Prisma.sql`u.username = ${name}`,
  albumId: (id) => Prisma.sql`EXISTS (
    SELECT 1 FROM "CollectionPhoto" cp
    WHERE cp."photoId" = p.id AND cp."collectionId" = ${id}
  )`,
  day: (day) => {
    const range = utcDayRange(day)
    // Matches feedWhere: an unparseable day yields nothing rather than
    // everything, so a bad value cannot read as "filter ignored".
    if (!range) return Prisma.sql`false`
    return Prisma.sql`p."createdAt" >= ${range.gte} AND p."createdAt" < ${range.lt}`
  },
}

/** `AND ...` for each key present in the scope, or nothing when it is empty. */
export function feedScopeSql(scope: FeedScope): Prisma.Sql {
  const clauses = (Object.keys(SCOPE_SQL) as (keyof FeedScope)[])
    .filter((key) => scope[key])
    .map((key) => SCOPE_SQL[key](scope[key] as string))

  return clauses.length ? Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}` : Prisma.empty
}

/**
 * The SELECT and joins for the random tab, shared by /explore and /api/photos.
 *
 * The random tab orders by a seeded md5 of the photo id, which Prisma cannot
 * express, so it runs as raw SQL — and both callers had a copy of it, the page
 * for the first screen and the endpoint for every screen after. The copies
 * drifted: `filmStock.manufacturer` reached only the Prisma-served tabs, and
 * `displayName` prefers it over brand, so the same photo carried different alt
 * text depending on which tab the reader arrived through.
 *
 * The column list is what MasonryGrid renders plus what `photoAlt` reads. `p.*`
 * shipped every Photo column — original path, byte size, timestamps — thirty
 * rows at a time, for nothing. Like counts are not in here either: a correlated
 * subquery in the target list is evaluated once per scanned row, before the
 * ORDER BY and LIMIT can cut it down, so both callers merge them afterwards
 * with `withLikeCounts`.
 *
 * The CASE WHENs yield SQL NULL for a photo with no film stock or camera, so
 * the relation arrives as a real null rather than the string 'null'.
 *
 * Callers append their own WHERE, ORDER BY and LIMIT. The aliases are the ones
 * `feedScopeSql` assumes.
 */
export const RANDOM_FEED_SELECT = Prisma.sql`
  SELECT p.id, p."thumbnailPath", p."mediumPath", p.width, p.height, p."blurHash", p.caption,
         json_build_object('username', u.username, 'name', u.name, 'avatar', u.avatar) as user,
         CASE WHEN f.id IS NULL THEN NULL
              ELSE json_build_object('name', f.name, 'brand', f.brand,
                                     'manufacturer', f.manufacturer, 'slug', f.slug) END as "filmStock",
         CASE WHEN c.id IS NULL THEN NULL
              ELSE json_build_object('name', c.name, 'brand', c.brand, 'slug', c.slug) END as camera
  FROM "Photo" p
  LEFT JOIN "User" u ON p."userId" = u.id
  LEFT JOIN "FilmStock" f ON p."filmStockId" = f.id
  LEFT JOIN "Camera" c ON p."cameraId" = c.id
`

/**
 * A row from `RANDOM_FEED_SELECT`.
 *
 * The relations come back as json_build_object results, so the shape has to be
 * declared rather than inferred from a Prisma include.
 */
export type RandomFeedRow = Pick<
  Photo,
  'id' | 'thumbnailPath' | 'mediumPath' | 'width' | 'height' | 'blurHash' | 'caption'
> & {
  user: { username: string; name: string | null; avatar: string | null } | null
  filmStock: {
    name: string
    brand: string | null
    manufacturer: string | null
    slug: string | null
  } | null
  camera: { name: string; brand: string | null; slug: string | null } | null
}
