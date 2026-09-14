import type { Prisma } from '@prisma/client'
import { parseIntParam } from '@/lib/validation'

/**
 * How the photo manager and the album picker ask for somebody's own photos.
 *
 * Here rather than inside the route for the same reason src/lib/photoFeed.ts
 * exists: the shape of the query is the part worth guarding, and a clause built
 * inline in a handler can only be checked by running the handler. Two things in
 * particular are easy to get quietly wrong — a search that matches fewer
 * columns than the box promises, and an order with no unique tiebreak, which
 * makes paging repeat one row and skip another without ever failing.
 */

export type MyPhotosSort = 'uploaded' | 'taken' | 'oldest'

export interface MyPhotosQuery {
  search: string
  /** One of the state pills: drafts, private, untagged, published. */
  filter: string
  cameraId: string
  filmStockId: string
  /** A four digit year, or 0 for any. */
  year: number
  sort: MyPhotosSort
}

export function parseMyPhotosQuery(params: URLSearchParams): MyPhotosQuery {
  const sort = params.get('sort')
  return {
    search: (params.get('search') ?? '').trim(),
    filter: params.get('filter') ?? '',
    cameraId: params.get('cameraId') ?? '',
    filmStockId: params.get('filmStockId') ?? '',
    year: parseIntParam(params.get('year'), { fallback: 0, min: 1800, max: 2400 }),
    sort: sort === 'taken' || sort === 'oldest' ? sort : 'uploaded',
  }
}

/**
 * What the words in the search box are allowed to match.
 *
 * Captions alone, before this — and 206 of the library's 1076 photographs have
 * one, so for four frames in five the box could not find anything at all. What
 * somebody types on this screen is almost always a camera or a film, because
 * fixing those is what the screen is for.
 */
function searchClause(search: string): Prisma.PhotoWhereInput[] {
  if (!search) return []
  const like = { contains: search, mode: 'insensitive' as const }
  return [{
    OR: [
      { caption: like },
      { camera: { name: like } },
      { camera: { brand: like } },
      { filmStock: { name: like } },
      { filmStock: { brand: like } },
    ],
  }]
}

/** A calendar year in UTC, half open so December 31st is included and January 1st is not. */
function yearClause(year: number): Prisma.PhotoWhereInput[] {
  if (!year) return []
  return [{ takenDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }]
}

function stateClause(filter: string): Prisma.PhotoWhereInput[] {
  if (filter === 'published') return [{ published: true }]
  if (filter === 'drafts') return [{ published: false }]
  if (filter === 'private') return [{ visibility: 'PRIVATE' }]
  if (filter === 'untagged') return [{ OR: [{ cameraId: null }, { filmStockId: null }] }]
  return []
}

/**
 * Every narrowing, combined with AND.
 *
 * AND rather than spreading each clause onto one object, because two of them —
 * the search and the "missing gear" pill — are themselves an OR. Spread, the
 * second `OR` key silently replaced the first, so searching while that pill was
 * lit returned everything missing gear whether or not it matched the search.
 */
export function myPhotosWhere(userId: string, query: MyPhotosQuery): Prisma.PhotoWhereInput {
  const clauses: Prisma.PhotoWhereInput[] = [
    ...searchClause(query.search),
    ...yearClause(query.year),
    ...stateClause(query.filter),
    ...(query.cameraId ? [{ cameraId: query.cameraId }] : []),
    ...(query.filmStockId ? [{ filmStockId: query.filmStockId }] : []),
  ]
  return clauses.length ? { userId, AND: clauses } : { userId }
}

/**
 * The order the grid is in, always ending in the id.
 *
 * A roll is a day rather than an upload batch, so date taken has to be
 * offerable — and it is shared by every frame on that roll and null on three
 * quarters of the library, while createdAt is shared across a bulk upload.
 * Neither is unique, and an order with no unique tiebreak lets paging show one
 * row twice and never show another, which looks like data loss and is not.
 */
export function myPhotosOrder(sort: MyPhotosSort): Prisma.PhotoOrderByWithRelationInput[] {
  if (sort === 'taken') {
    return [{ takenDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }]
  }
  if (sort === 'oldest') return [{ createdAt: 'asc' }, { id: 'asc' }]
  return [{ createdAt: 'desc' }, { id: 'desc' }]
}
