import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { feedScopeSql, feedWhere, type FeedScope, type FeedTab } from './photoFeed'

export interface Neighbors {
  prevId: string | null
  nextId: string | null
  /**
   * Where the photo sits in the set, for an album or a narrowed list in date
   * order: "12 of 36". Left out for shuffled and site-wide orders, where a
   * position means nothing.
   */
  position?: { index: number; total: number }
}

/**
 * The photos either side of one, in the order of the grid it was opened from.
 *
 * Prev and next always walked by upload date, so they disagreed with every grid
 * that was not in date order: in an album its owner had arranged, Next jumped
 * to whatever was uploaded after rather than the tile beside it, and on a
 * shuffled film or camera page it never matched the grid at all. Each ordering
 * here is the one the grid and /api/photos use, with the same tiebreakers, so
 * stepping through matches scrolling through.
 *
 * "Previous" is the tile before in the grid and "next" the tile after.
 */
export async function photoNeighbors({
  photo,
  order,
  seed,
  scope,
  hidden,
  owner,
  followingIds,
}: {
  photo: { id: string; createdAt: Date }
  order: FeedTab
  /** The shuffle the grid was in, for the random order. */
  seed: number | null
  scope: FeedScope
  hidden: string[]
  /** The viewer, when the feed is theirs and may include private photos. */
  owner: string | null
  followingIds: string[]
}): Promise<Neighbors> {
  if (scope.albumId) return albumNeighbors(photo.id, scope, hidden, owner)

  // The same WHERE the raw-SQL feeds use. Aliases p and u, as feedScopeSql
  // expects.
  const sqlWhere = Prisma.sql`
    p.kind = 'community' AND p."uploadComplete" AND p."deletedAt" IS NULL
    AND ((p.visibility = 'public' AND p.screening = 'clear') OR p."userId" = ${owner})
    AND (${hidden.length === 0} OR p."userId" <> ALL(${hidden}))
    ${feedScopeSql(scope)}`

  if (order === 'random' && seed !== null) {
    const step = async (direction: 'prev' | 'next') => {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "Photo" p JOIN "User" u ON u.id = p."userId"
        WHERE ${sqlWhere}
          AND ${direction === 'next'
            ? Prisma.sql`md5(p.id || ${seed}) > md5(${photo.id} || ${seed})`
            : Prisma.sql`md5(p.id || ${seed}) < md5(${photo.id} || ${seed})`}
        ORDER BY md5(p.id || ${seed}) ${direction === 'next' ? Prisma.sql`ASC` : Prisma.sql`DESC`}
        LIMIT 1`
      return rows[0]?.id ?? null
    }
    const [prevId, nextId] = await Promise.all([step('prev'), step('next')])
    return { prevId, nextId }
  }

  if (order === 'popular') {
    // Most liked first, then newest, then id, as feedOrderBy has it. Compared
    // as a row so the three keys order together.
    const step = async (direction: 'prev' | 'next') => {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        WITH ranked AS (
          SELECT p.id, p."createdAt",
                 (SELECT count(*) FROM "Like" l WHERE l."photoId" = p.id) AS likes
          FROM "Photo" p JOIN "User" u ON u.id = p."userId"
          WHERE ${sqlWhere}
        ), here AS (
          SELECT likes, "createdAt", id FROM ranked WHERE id = ${photo.id}
        )
        SELECT r.id FROM ranked r, here h
        WHERE ${direction === 'next'
          ? Prisma.sql`(r.likes, r."createdAt", r.id) < (h.likes, h."createdAt", h.id)`
          : Prisma.sql`(r.likes, r."createdAt", r.id) > (h.likes, h."createdAt", h.id)`}
        ORDER BY ${direction === 'next'
          ? Prisma.sql`r.likes DESC, r."createdAt" DESC, r.id DESC`
          : Prisma.sql`r.likes ASC, r."createdAt" ASC, r.id ASC`}
        LIMIT 1`
      return rows[0]?.id ?? null
    }
    const [prevId, nextId] = await Promise.all([step('prev'), step('next')])
    return { prevId, nextId }
  }

  // Newest first, with the id breaking ties the way feedOrderBy does. Without
  // it, photos sharing a createdAt from one batch upload were skipped. ANDed
  // with the feed's where rather than spread over it, because a day scope sets
  // createdAt itself.
  const where = feedWhere(order === 'following' ? 'following' : 'recent', followingIds, scope, hidden, owner)
  const [prev, next] = await Promise.all([
    prisma.photo.findFirst({
      where: {
        AND: [where, {
          OR: [
            { createdAt: { gt: photo.createdAt } },
            { createdAt: photo.createdAt, id: { gt: photo.id } },
          ],
        }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    }),
    prisma.photo.findFirst({
      where: {
        AND: [where, {
          OR: [
            { createdAt: { lt: photo.createdAt } },
            { createdAt: photo.createdAt, id: { lt: photo.id } },
          ],
        }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    }),
  ])
  const narrowed = Object.values(scope).some(Boolean)
  if (!narrowed) return { prevId: prev?.id ?? null, nextId: next?.id ?? null }

  const [before, total] = await Promise.all([
    prisma.photo.count({
      where: {
        AND: [where, {
          OR: [
            { createdAt: { gt: photo.createdAt } },
            { createdAt: photo.createdAt, id: { gt: photo.id } },
          ],
        }],
      },
    }),
    prisma.photo.count({ where }),
  ])
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null, position: { index: before + 1, total } }
}

/** An album in its owner's order, as albumPhotoPage serves it. */
async function albumNeighbors(photoId: string, scope: FeedScope, hidden: string[], owner: string | null): Promise<Neighbors> {
  const albumId = scope.albumId!
  const here = await prisma.collectionPhoto.findUnique({
    where: { collectionId_photoId: { collectionId: albumId, photoId } },
    select: { order: true },
  })
  if (!here) return { prevId: null, nextId: null }

  // Membership is the join being walked, so the album clause is left out of
  // the photo filter, as /api/photos does.
  const visible = feedWhere('recent', [], { ...scope, albumId: undefined }, hidden, owner)
  const [prev, next] = await Promise.all([
    prisma.collectionPhoto.findFirst({
      where: {
        collectionId: albumId,
        photo: visible,
        OR: [{ order: { lt: here.order } }, { order: here.order, photoId: { lt: photoId } }],
      },
      orderBy: [{ order: 'desc' }, { photoId: 'desc' }],
      select: { photoId: true },
    }),
    prisma.collectionPhoto.findFirst({
      where: {
        collectionId: albumId,
        photo: visible,
        OR: [{ order: { gt: here.order } }, { order: here.order, photoId: { gt: photoId } }],
      },
      orderBy: [{ order: 'asc' }, { photoId: 'asc' }],
      select: { photoId: true },
    }),
  ])
  const [before, total] = await Promise.all([
    prisma.collectionPhoto.count({
      where: {
        collectionId: albumId,
        photo: visible,
        OR: [{ order: { lt: here.order } }, { order: here.order, photoId: { lt: photoId } }],
      },
    }),
    prisma.collectionPhoto.count({ where: { collectionId: albumId, photo: visible } }),
  ])
  return {
    prevId: prev?.photoId ?? null,
    nextId: next?.photoId ?? null,
    position: { index: before + 1, total },
  }
}
