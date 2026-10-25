import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Up to N photos for each of many parents, picked in the database.
 *
 * Every card that shows a strip of thumbnails — a film stock, a camera, an
 * album, a photographer's gear — needs "the first four photos of each of these
 * fifty things". Prisma cannot express that: a nested `take` on a to-many
 * relation is applied *in memory*, and the SQL it emits carries no LIMIT at
 * all. Asking for four photos of fifty cameras fetched every photo of all
 * fifty, every column, and threw away all but two hundred rows.
 *
 * The database does it in one pass with a window function. This module is the
 * one place that query lives; it was hand-copied into five pages, each with
 * its own slightly different visibility rules.
 */

/** The column that groups photos into per-parent previews. */
export type PreviewKey = 'cameraId' | 'filmStockId'

/** What a preview tile draws: a thumbnail and its blur placeholder. */
export type PreviewPhoto = {
  id: string
  thumbnailPath: string
  blurHash: string | null
}

/** How many tiles a card shows. */
export const PREVIEW_PHOTOS = 4

/**
 * The photos a stranger may see.
 *
 * A fragment rather than a parameter, because the four call sites genuinely
 * differ: a public index applies this, a photographer looking at their own
 * albums does not.
 */
export const VISIBLE_TO_ANYONE = Prisma.sql`kind = 'community' AND published = true AND visibility = 'public' AND screening = 'clear'`

/** Nothing filtered out — for a viewer looking at their own photos. */
export const ANY_PHOTO = Prisma.sql`TRUE`

/** Drops accounts this viewer has blocked, in either direction. */
export function notHidden(hiddenUserIds: string[]): Prisma.Sql {
  return hiddenUserIds.length === 0
    ? Prisma.empty
    : Prisma.sql`AND "userId" <> ALL(${hiddenUserIds})`
}

/**
 * Preview photos for a set of cameras or film stocks.
 *
 * `parents` is the ids to cover, or `'all'` for every parent the `where`
 * fragment admits — which is what a single photographer's gear list wants,
 * since it does not know the ids up front.
 *
 * `order` is `'random'` where the card is an invitation to browse and
 * `'recent'` where it is a record of what was shot.
 */
export async function previewPhotosByGear<K extends PreviewKey>({
  key,
  parents,
  where,
  order,
  perParent = PREVIEW_PHOTOS,
}: {
  key: K
  parents: string[] | 'all'
  where: Prisma.Sql
  order: 'random' | 'recent'
  perParent?: number
}): Promise<(PreviewPhoto & Record<K, string>)[]> {
  if (parents !== 'all' && parents.length === 0) return []

  // Identifiers cannot be bound as parameters, so they are interpolated. Both
  // come from closed unions in this module's own types, never from a request.
  const column = Prisma.raw(`"${key}"`)
  const rank = Prisma.raw(order === 'random' ? 'RANDOM()' : '"createdAt" DESC')

  const scope =
    parents === 'all'
      ? Prisma.sql`${column} IS NOT NULL`
      : Prisma.sql`${column} IN (${Prisma.join(parents)})`

  return prisma.$queryRaw`
    SELECT id, "thumbnailPath", "blurHash", ${column} FROM (
      SELECT id, "thumbnailPath", "blurHash", ${column},
             ROW_NUMBER() OVER (PARTITION BY ${column} ORDER BY ${rank}) AS rn
      FROM "Photo"
      WHERE ${scope} AND ${where}
    ) ranked
    WHERE rn <= ${perParent}
  `
}

/**
 * Preview photos for a set of albums.
 *
 * Separate from the gear version because an album holds its photos through a
 * join table, so the rank has to be taken over the joined rows. Ranking the
 * membership rows first — which two pages did — let a private photo win one of
 * the four slots and then get filtered out, so a public album with plenty of
 * public photos could still show a half-empty strip.
 */
export async function previewPhotosByAlbum({
  albumIds,
  where,
  perParent = PREVIEW_PHOTOS,
}: {
  albumIds: string[]
  where: Prisma.Sql
  perParent?: number
}): Promise<(PreviewPhoto & { collectionId: string })[]> {
  if (albumIds.length === 0) return []

  return prisma.$queryRaw`
    SELECT id, "thumbnailPath", "blurHash", "collectionId" FROM (
      SELECT p.id, p."thumbnailPath", p."blurHash", cp."collectionId",
             ROW_NUMBER() OVER (PARTITION BY cp."collectionId" ORDER BY RANDOM()) AS rn
      FROM "CollectionPhoto" cp
      JOIN "Photo" p ON p.id = cp."photoId"
      WHERE cp."collectionId" IN (${Prisma.join(albumIds)}) AND ${where}
    ) ranked
    WHERE rn <= ${perParent}
  `
}

/** Buckets previews by the column they were partitioned on. */
export function groupPreviews<K extends string, T extends Record<K, string>>(
  previews: T[],
  key: K
): Map<string, T[]> {
  const byParent = new Map<string, T[]>()
  for (const preview of previews) {
    const id = preview[key]
    const bucket = byParent.get(id)
    if (bucket) bucket.push(preview)
    else byParent.set(id, [preview])
  }
  return byParent
}
