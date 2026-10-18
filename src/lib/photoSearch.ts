import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenFilter } from '@/lib/blocks'
import { applyFacets } from '@/lib/facets'

/**
 * Photo search: which public photos match a query, in what order, and what
 * the film and camera filters would leave if pressed.
 *
 * Three sources are merged. Content matches come from the vision worker, best
 * first. Caption matches, and photos shot on the films and cameras the query
 * names, come from the database, newest first. Every
 * candidate then goes through the same visibility, block and scope filters as
 * any other public grid, since the worker knows nothing about who may see what.
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
  /** Ids the worker matched by content, for saying so on the page. */
  contentIds: Set<string>
  films: FacetOption[]
  cameras: FacetOption[]
}

/** Shown per filter. Ordered by how many results each would leave. */
const FACET_OPTIONS = 20

/**
 * Captions that mention the query, newest first.
 *
 * Whole words for queries in Latin script: as a substring, "hi" matched
 * "this", "shirt" and "China", 54 photos for a greeting. Other scripts match
 * anywhere, since Chinese and Japanese do not separate words with spaces.
 */
async function captionMatches(query: string): Promise<string[]> {
  const wholeWords = /^[\p{Script=Latin}\d\s'.-]+$/u.test(query)
  const match = wholeWords
    ? Prisma.sql`caption ~* ${`\\m${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\M`}`
    : Prisma.sql`caption ILIKE ${`%${query.replace(/[%_\\]/g, '\\$&')}%`}`
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Photo"
    WHERE published = true AND visibility = 'public' AND screening = 'clear' AND ${match}
    ORDER BY "createdAt" DESC, id DESC
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
  const empty: PhotoSearchResult = { ids: [], total: 0, unfilteredTotal: 0, contentIds: new Set(), films: [], cameras: [] }

  const [captionIds, gearIds, scoped] = await Promise.all([
    captionMatches(query),
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
      id: { in: [...new Set([...contentIds, ...captionIds, ...gearIds])] },
    },
    select: { id: true, filmStockId: true, cameraId: true, createdAt: true, _count: { select: { likes: true } } },
  })

  const { matches, counts, present } = applyFacets(candidates, [
    { key: 'film', active: typeof film === 'string' ? film : undefined, valueOf: p => p.filmStockId },
    { key: 'camera', active: typeof camera === 'string' ? camera : undefined, valueOf: p => p.cameraId },
  ])

  const contentRank = new Map(contentIds.map((id, i) => [id, i]))
  const newestFirst = (a: (typeof matches)[number], b: (typeof matches)[number]) =>
    b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)
  const ordered = [...matches].sort((a, b) => {
    if (sort === 'recent') return newestFirst(a, b)
    if (sort === 'popular') return b._count.likes - a._count.likes || newestFirst(a, b)
    // Content matches in the worker's order, then caption and gear matches,
    // newest first.
    const ra = contentRank.get(a.id)
    const rb = contentRank.get(b.id)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return newestFirst(a, b)
  })

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
    contentIds: new Set(contentIds),
    films: option('film', filmRows),
    cameras: option('camera', cameraRows),
  }
}
