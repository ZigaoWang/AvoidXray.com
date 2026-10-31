import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenFilter } from '@/lib/blocks'
import { applyFacets } from '@/lib/facets'

/**
 * Photo search: which public photos match a query, in what order, and what
 * the film and camera filters would leave if pressed.
 *
 * Three sources are merged. Word matches (the caption, the roll's title, the
 * lab's name), and photos shot on the films and cameras the query names, come
 * from the database. Content matches come from the vision worker, best first.
 * Every candidate then goes through the same visibility, block and scope
 * filters as any other public grid, since the worker knows nothing about who
 * may see what.
 *
 * Photos only the worker found come after the rest, as their own group the
 * page labels "Photos that look like". The model ranks the closest-looking
 * photos it has, so a place nobody has shot still finds some, from places
 * that look like it. A photo the words also find stays with the word matches.
 */

/**
 * Candidates per source, ranked before paging. Above the size of the library
 * (1,423 public photos in October 2026), so a count is never the cap: at 1000,
 * "kodak" read "Photos (1000)".
 */
export const MAX_RANKED_PHOTOS = 5000

export type PhotoSort = 'relevant' | 'recent' | 'popular'

export function parsePhotoSort(value: string | undefined): PhotoSort {
  return value === 'recent' || value === 'popular' ? value : 'relevant'
}

/** Where to look: one photographer, one album, or one film or camera. */
export interface PhotoSearchScope {
  /** A username. */
  user?: string
  album?: string
  film?: string
  camera?: string
}

export interface FacetOption {
  id: string
  name: string
  /** Results it would leave, with the other filter applied. */
  count: number
}

export interface PhotoSearchResult {
  /** One page, in order. */
  ids: string[]
  total: number
  /** Matches before the film and camera filters, for "12 of 40 photos". */
  unfilteredTotal: number
  /**
   * Where the photos only the worker found begin in the full order: every
   * result from this index on looks like the query rather than naming it.
   * Equal to `total` when there are none.
   */
  lookalikeStart: number
  films: FacetOption[]
  cameras: FacetOption[]
}

/** Shown per filter. Ordered by how many results each would leave. */
const FACET_OPTIONS = 20

/**
 * Photos whose words mention the query, newest first: the caption, the title
 * of the roll it is on, or the name of the lab that developed it. All three
 * are shown on public pages. The roll's location is not: it stays the
 * owner's, searchable in their library only.
 *
 * Whole words for queries in Latin script: as a substring, "hi" matched
 * "this", "shirt" and "China", 54 photos for a greeting. Other scripts match
 * anywhere, since Chinese and Japanese do not separate words with spaces.
 */
async function wordMatches(query: string): Promise<string[]> {
  const wholeWords = /^[\p{Script=Latin}\d\s'.-]+$/u.test(query)
  const pattern = wholeWords
    ? `\\m${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\M`
    : `%${query.replace(/[%_\\]/g, '\\$&')}%`
  const matches = (column: Prisma.Sql) => wholeWords ? Prisma.sql`${column} ~* ${pattern}` : Prisma.sql`${column} ILIKE ${pattern}`
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Photo" p
    LEFT JOIN "Roll" r ON r.id = p."rollId"
    LEFT JOIN "Lab" l ON l.id = p."labId"
    WHERE p.kind = 'community' AND p."uploadComplete" AND p."deletedAt" IS NULL AND p.visibility = 'public' AND p.screening = 'clear'
      AND (${matches(Prisma.sql`p.caption`)} OR ${matches(Prisma.sql`r.title`)} OR ${matches(Prisma.sql`l.name`)})
    ORDER BY p."createdAt" DESC, p.id DESC
    LIMIT ${MAX_RANKED_PHOTOS}
  `
  return rows.map(r => r.id)
}

/** Public photos shot on any of the named films or cameras, newest first. */
async function gearMatches(gear: { filmIds: string[]; cameraIds: string[] } | undefined): Promise<string[]> {
  if (!gear || (!gear.filmIds.length && !gear.cameraIds.length)) return []
  const rows = await prisma.photo.findMany({
    where: {
      ...PUBLIC_PHOTO,
      OR: [
        ...(gear.filmIds.length ? [{ filmStockId: { in: gear.filmIds } }] : []),
        ...(gear.cameraIds.length ? [{ cameraId: { in: gear.cameraIds } }] : []),
      ],
    },
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_RANKED_PHOTOS,
  })
  return rows.map(r => r.id)
}

/**
 * The scope as a filter. A scope that names something this viewer may not see
 * (a private album, an unknown user) matches nothing rather than being ignored,
 * so a link cannot widen into a search of the whole site.
 */
async function scopeWhere(scope: PhotoSearchScope, viewerId: string | null): Promise<Prisma.PhotoWhereInput | null> {
  const where: Prisma.PhotoWhereInput = {}
  if (scope.user) {
    const user = await prisma.user.findUnique({ where: { username: scope.user.toLowerCase() }, select: { id: true } })
    if (!user) return null
    where.userId = user.id
  }
  if (scope.album) {
    const album = await prisma.collection.findUnique({ where: { id: scope.album }, select: { public: true, userId: true } })
    if (!album || (!album.public && album.userId !== viewerId)) return null
    where.collections = { some: { collectionId: scope.album } }
  }
  if (scope.film) where.filmStockId = scope.film
  if (scope.camera) where.cameraId = scope.camera
  return where
}

export async function searchPhotos(input: {
  query: string
  /** From the vision worker, best first. Empty when it is unavailable or refused. */
  contentIds: string[]
  /** Films and cameras the query names, from the catalog search. */
  gear?: { filmIds: string[]; cameraIds: string[] }
  scope: PhotoSearchScope
  sort: PhotoSort
  viewerId: string | null
  hidden: string[]
  skip: number
  take: number
}): Promise<PhotoSearchResult> {
  const { query, contentIds, gear, scope, sort, viewerId, hidden, skip, take } = input
  const empty: PhotoSearchResult = { ids: [], total: 0, unfilteredTotal: 0, lookalikeStart: 0, films: [], cameras: [] }

  const [wordIds, gearIds, scoped] = await Promise.all([
    wordMatches(query),
    gearMatches(gear),
    scopeWhere(scope, viewerId),
  ])
  if (!scoped) return empty

  // The film and camera filters are applied below, as facets, so that each
  // filter's counts can be taken with the other one applied.
  const { filmStockId: film, cameraId: camera, ...scopeRest } = scoped
  const candidates = await prisma.photo.findMany({
    // AND rather than spreads: the scope's `userId` replaced the block
    // filter's, so searching inside a profile showed the photos of someone the
    // viewer had blocked.
    where: {
      AND: [PUBLIC_PHOTO, hiddenFilter(hidden), scopeRest],
      id: { in: [...new Set([...contentIds, ...wordIds, ...gearIds])] },
    },
    select: { id: true, filmStockId: true, cameraId: true, createdAt: true, _count: { select: { likes: true } } },
  })

  const { matches, counts, present } = applyFacets(candidates, [
    { key: 'film', active: typeof film === 'string' ? film : undefined, valueOf: p => p.filmStockId },
    { key: 'camera', active: typeof camera === 'string' ? camera : undefined, valueOf: p => p.cameraId },
  ])

  const contentRank = new Map(contentIds.map((id, i) => [id, i]))
  const named = new Set([...wordIds, ...gearIds])
  const lookalike = (id: string) => !named.has(id)
  const newestFirst = (a: (typeof matches)[number], b: (typeof matches)[number]) =>
    b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)
  const ordered = [...matches].sort((a, b) => {
    const group = Number(lookalike(a.id)) - Number(lookalike(b.id))
    if (group) return group
    if (sort === 'recent') return newestFirst(a, b)
    if (sort === 'popular') return b._count.likes - a._count.likes || newestFirst(a, b)
    // Within a group, content matches in the worker's order, then the rest
    // newest first.
    const ra = contentRank.get(a.id)
    const rb = contentRank.get(b.id)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return newestFirst(a, b)
  })

  const firstLookalike = ordered.findIndex(p => lookalike(p.id))

  const filmIds = present.film.slice(0, FACET_OPTIONS)
  const cameraIds = present.camera.slice(0, FACET_OPTIONS)
  const [filmRows, cameraRows] = await Promise.all([
    filmIds.length ? prisma.filmStock.findMany({ where: { id: { in: filmIds } }, select: { id: true, name: true } }) : [],
    cameraIds.length ? prisma.camera.findMany({ where: { id: { in: cameraIds } }, select: { id: true, name: true } }) : [],
  ])
  const option = (group: 'film' | 'camera', rows: { id: string; name: string }[]) =>
    rows
      .map(r => ({ id: r.id, name: r.name, count: counts[group][r.id] ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return {
    ids: ordered.slice(skip, skip + take).map(p => p.id),
    total: ordered.length,
    unfilteredTotal: candidates.length,
    lookalikeStart: firstLookalike === -1 ? ordered.length : firstLookalike,
    films: option('film', filmRows),
    cameras: option('camera', cameraRows),
  }
}
