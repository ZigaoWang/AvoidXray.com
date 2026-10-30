import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { publicObjectUrl, signedObjectUrl } from '@/lib/oss'
import { formatRollDate } from './rollFields'

/**
 * What the library home shows: the owner's rolls newest first, as contact
 * sheets, and the photos in no roll, both narrowed by the same filters.
 *
 * "Newest" is when the roll was shot, where its owner said, and otherwise when
 * its first photo was uploaded: a roll made by the backfill was created long
 * after its photos. Trashed photos are left out everywhere but the Trash.
 */

export interface LibraryFilters {
  filmStockId?: string
  cameraId?: string
  labId?: string
  /** The year shot, from the roll's dates or the photo's own; 'undated' when neither has one. */
  year?: number | 'undated'
  status?: 'published' | 'private'
  /** Photos with no camera or no film stock. */
  missingGear?: boolean
  /** Photos to keep, from a search; undefined means no search. */
  ids?: string[]
}

export const ROLLS_PER_PAGE = 8
export const LOOSE_PER_PAGE = 120
export const ALL_PER_PAGE = 120
/** As many ids as "Select all" takes at once; a larger match asks to narrow the view. */
export const MATCHING_CAP = 5000

export type LibrarySort = 'shot' | 'uploaded'

/** The SQL that narrows the owner's photos, as `p` joined to its roll `r`. */
function photoWhere(ownerId: string, f: LibraryFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`p."userId" = ${ownerId}`,
    Prisma.sql`p.kind = 'community'`,
    Prisma.sql`p."uploadComplete"`,
    Prisma.sql`p."deletedAt" IS NULL`,
  ]
  if (f.filmStockId) parts.push(Prisma.sql`p."filmStockId" = ${f.filmStockId}`)
  if (f.cameraId) parts.push(Prisma.sql`p."cameraId" = ${f.cameraId}`)
  if (f.labId) parts.push(Prisma.sql`p."labId" = ${f.labId}`)
  if (f.status === 'published') parts.push(Prisma.sql`p.visibility = 'public'`)
  if (f.status === 'private') parts.push(Prisma.sql`p.visibility = 'private'`)
  if (f.missingGear) parts.push(Prisma.sql`(p."cameraId" IS NULL OR p."filmStockId" IS NULL)`)
  if (f.year === 'undated') {
    parts.push(Prisma.sql`p."takenDate" IS NULL AND r."shotFrom" IS NULL AND r."shotTo" IS NULL`)
  } else if (f.year) {
    const from = new Date(Date.UTC(f.year, 0, 1))
    const to = new Date(Date.UTC(f.year + 1, 0, 1))
    parts.push(Prisma.sql`(
      (p."takenDate" >= ${from} AND p."takenDate" < ${to})
      OR (r."shotFrom" < ${to} AND COALESCE(r."shotTo", r."shotFrom") >= ${from})
    )`)
  }
  if (f.ids) parts.push(f.ids.length ? Prisma.sql`p.id = ANY(${f.ids})` : Prisma.sql`FALSE`)
  return Prisma.join(parts, ' AND ')
}

export interface LibraryPhoto {
  id: string
  src: string
  width: number
  height: number
  published: boolean
  held: boolean
  caption: string | null
  rollId: string | null
  rollPosition: number | null
  blurHash: string | null
  /** The day it was shot, as YYYY-MM-DD, when known. */
  takenDate: string | null
  filmStock: string | null
  camera: string | null
}

export interface LibraryRoll {
  id: string
  title: string | null
  shotFrom: string | null
  shotTo: string | null
  filmStock: string | null
  camera: string | null
  lab: string | null
  /** Every photo in the roll, and how many of those are published, whatever the filters. */
  photoCount: number
  publishedCount: number
  /** The photos the filters keep, in frame order. */
  photos: LibraryPhoto[]
}

const PHOTO_FIELDS = {
  id: true, thumbKey: true, thumbnailPath: true, imagesPublic: true, width: true, height: true,
  visibility: true, screening: true, caption: true, rollId: true, rollPosition: true, blurHash: true, takenDate: true,
  filmStock: { select: { name: true } }, camera: { select: { name: true } },
} as const

/** The address a tile loads its thumbnail from: public, or signed for the owner. */
async function tileSource(p: { thumbKey: string; imagesPublic: boolean }): Promise<string> {
  return p.imagesPublic ? publicObjectUrl(p.thumbKey) : signedObjectUrl(p.thumbKey)
}

async function toPhoto(p: Prisma.PhotoGetPayload<{ select: typeof PHOTO_FIELDS }>): Promise<LibraryPhoto> {
  return {
    id: p.id,
    src: await tileSource(p),
    width: p.width,
    height: p.height,
    published: p.visibility === 'PUBLIC',
    held: p.screening === 'HELD',
    caption: p.caption,
    rollId: p.rollId,
    rollPosition: p.rollPosition,
    blurHash: p.blurHash,
    takenDate: p.takenDate ? p.takenDate.toISOString().slice(0, 10) : null,
    filmStock: p.filmStock?.name ?? null,
    camera: p.camera?.name ?? null,
  }
}

/** One page of rolls holding photos the filters keep, newest first. */
export async function rollPage(ownerId: string, filters: LibraryFilters, page: number) {
  const where = photoWhere(ownerId, filters)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r.id
    FROM "Roll" r
    JOIN "Photo" p ON p."rollId" = r.id
    WHERE r."ownerId" = ${ownerId} AND ${where}
    GROUP BY r.id
    ORDER BY COALESCE(MAX(r."shotFrom")::timestamp, MIN(p."createdAt")) DESC, r.id DESC
    LIMIT ${ROLLS_PER_PAGE + 1} OFFSET ${page * ROLLS_PER_PAGE}`
  const more = rows.length > ROLLS_PER_PAGE
  const ids = rows.slice(0, ROLLS_PER_PAGE).map(r => r.id)
  if (!ids.length) return { rolls: [] as LibraryRoll[], more: false }

  const matching = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Photo" p JOIN "Roll" r ON r.id = p."rollId"
    WHERE r.id = ANY(${ids}) AND ${where}`
  const [rolls, photos, totals] = await Promise.all([
    prisma.roll.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, title: true, shotFrom: true, shotFromPrecision: true, shotTo: true, shotToPrecision: true,
        filmStock: { select: { name: true } }, camera: { select: { name: true } }, lab: { select: { name: true } },
      },
    }),
    prisma.photo.findMany({
      where: { id: { in: matching.map(m => m.id) } },
      select: PHOTO_FIELDS,
      orderBy: [{ rollPosition: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.photo.groupBy({
      by: ['rollId', 'visibility'],
      where: { rollId: { in: ids }, deletedAt: null, uploadComplete: true },
      _count: { _all: true },
    }),
  ])

  const byRoll = new Map<string, LibraryPhoto[]>()
  for (const p of photos) {
    const list = byRoll.get(p.rollId!) ?? []
    list.push(await toPhoto(p))
    byRoll.set(p.rollId!, list)
  }
  const rollById = new Map(rolls.map(r => [r.id, r]))
  return {
    more,
    rolls: ids.map((id): LibraryRoll => {
      const r = rollById.get(id)!
      const counts = totals.filter(t => t.rollId === id)
      return {
        id,
        title: r.title,
        shotFrom: formatRollDate(r.shotFrom, r.shotFromPrecision),
        shotTo: formatRollDate(r.shotTo, r.shotToPrecision),
        filmStock: r.filmStock?.name ?? null,
        camera: r.camera?.name ?? null,
        lab: r.lab?.name ?? null,
        photoCount: counts.reduce((n, c) => n + c._count._all, 0),
        publishedCount: counts.filter(c => c.visibility === 'PUBLIC').reduce((n, c) => n + c._count._all, 0),
        photos: byRoll.get(id) ?? [],
      }
    }),
  }
}

/** One page of photos in no roll, newest upload first. */
export async function loosePage(ownerId: string, filters: LibraryFilters, page: number) {
  const where = photoWhere(ownerId, filters)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Photo" p LEFT JOIN "Roll" r ON r.id = p."rollId"
    WHERE p."rollId" IS NULL AND ${where}
    ORDER BY p."createdAt" DESC, p.id DESC
    LIMIT ${LOOSE_PER_PAGE + 1} OFFSET ${page * LOOSE_PER_PAGE}`
  const more = rows.length > LOOSE_PER_PAGE
  const ids = rows.slice(0, LOOSE_PER_PAGE).map(r => r.id)
  const photos = await prisma.photo.findMany({ where: { id: { in: ids } }, select: PHOTO_FIELDS })
  const order = new Map(ids.map((id, i) => [id, i]))
  photos.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  return { more, photos: await Promise.all(photos.map(toPhoto)) }
}

/**
 * One page of every photo the filters keep, in no rolls: by when it was shot
 * (its own date, else its roll's, else its upload), or by upload.
 */
export async function allPage(ownerId: string, filters: LibraryFilters, page: number, sort: LibrarySort = 'shot') {
  const where = photoWhere(ownerId, filters)
  const order = sort === 'uploaded'
    ? Prisma.sql`p."createdAt" DESC, p.id DESC`
    : Prisma.sql`COALESCE(p."takenDate"::timestamp, r."shotFrom"::timestamp, p."createdAt") DESC, p."rollPosition" ASC NULLS LAST, p.id DESC`
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Photo" p LEFT JOIN "Roll" r ON r.id = p."rollId"
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${ALL_PER_PAGE + 1} OFFSET ${page * ALL_PER_PAGE}`
  const more = rows.length > ALL_PER_PAGE
  const ids = rows.slice(0, ALL_PER_PAGE).map(r => r.id)
  const photos = await prisma.photo.findMany({ where: { id: { in: ids } }, select: PHOTO_FIELDS })
  const position = new Map(ids.map((id, i) => [id, i]))
  photos.sort((a, b) => position.get(a.id)! - position.get(b.id)!)
  return { more, photos: await Promise.all(photos.map(toPhoto)) }
}

/**
 * Every photo id the filters keep, and how many there are: what "Select all"
 * takes, and what tells a selection which of its photos a filter hides.
 */
export async function matchingIds(ownerId: string, filters: LibraryFilters) {
  const where = photoWhere(ownerId, filters)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Photo" p LEFT JOIN "Roll" r ON r.id = p."rollId"
    WHERE ${where}
    LIMIT ${MATCHING_CAP + 1}`
  return { ids: rows.slice(0, MATCHING_CAP).map(r => r.id), truncated: rows.length > MATCHING_CAP }
}

/** The film stocks, cameras, labs and years in the owner's library, for the filters, and whether any photo has no date. */
export async function libraryFacets(ownerId: string) {
  const base = { userId: ownerId, kind: 'COMMUNITY' as const, uploadComplete: true, deletedAt: null }
  const [films, cameras, labs, years, undated] = await Promise.all([
    prisma.filmStock.findMany({ where: { photos: { some: base } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.camera.findMany({ where: { photos: { some: base } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.lab.findMany({ where: { photos: { some: base } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.$queryRaw<{ year: number }[]>`
      SELECT DISTINCT y::int AS year FROM (
        SELECT EXTRACT(YEAR FROM p."takenDate") AS y FROM "Photo" p
          WHERE p."userId" = ${ownerId} AND p."deletedAt" IS NULL AND p."takenDate" IS NOT NULL
        UNION SELECT EXTRACT(YEAR FROM r."shotFrom") FROM "Roll" r WHERE r."ownerId" = ${ownerId} AND r."shotFrom" IS NOT NULL
        UNION SELECT EXTRACT(YEAR FROM r."shotTo") FROM "Roll" r WHERE r."ownerId" = ${ownerId} AND r."shotTo" IS NOT NULL
      ) years WHERE y IS NOT NULL ORDER BY year DESC`,
    prisma.photo.count({
      where: {
        ...base, takenDate: null,
        OR: [{ rollId: null }, { roll: { shotFrom: null, shotTo: null } }],
      },
    }),
  ])
  return { films, cameras, labs, years: years.map(y => y.year), undated: undated > 0 }
}
