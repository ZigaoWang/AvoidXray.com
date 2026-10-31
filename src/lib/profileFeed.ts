import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { ProfileSort } from '@/lib/profileView'
import {
  previewPhotosByGear,
  groupPreviews,
  type PreviewPhoto,
} from '@/lib/previewPhotos'

/**
 * Aggregates for a photographer's profile.
 *
 * The activity heatmap only needs a count per day, but it was built in the
 * browser from every photo the profile owned — 573 full records serialized into
 * the page to draw 365 squares.
 */

export interface PhotoDay {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string
  count: number
}

/**
 * Photos per day for the last year, counted in UTC.
 *
 * UTC deliberately. The previous client-side version keyed counts by the
 * viewer's local date while labeling the squares with UTC dates, so the same
 * profile drew a different heatmap depending on where it was viewed, and near
 * midnight the count and its label disagreed. Counting server-side gives every
 * viewer the same answer, and the day filter uses the same boundaries so
 * clicking a square returns exactly the photos it counted.
 *
 * createdAt is `timestamp without time zone` holding UTC, so it is truncated
 * as-is. Writing `AT TIME ZONE 'UTC'` converts it to timestamptz, after which
 * date_trunc works in the *database session's* timezone — on a server set to
 * Asia/Shanghai that moved every photo eight hours, so squares were counted
 * against one day and the filter queried another.
 */
export async function getPhotoDays(userId: string, viewerId?: string | null): Promise<PhotoDay[]> {
  const ownVisible = viewerId === userId
  const since = new Date()
  since.setUTCFullYear(since.getUTCFullYear() - 1)
  // Back to the preceding Sunday, which is where the grid starts.
  since.setUTCDate(since.getUTCDate() - since.getUTCDay() - 7)

  const rows = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS date, COUNT(*) AS count
    FROM "Photo"
    WHERE kind = 'community' AND "uploadComplete" AND "deletedAt" IS NULL AND (${ownVisible}::boolean OR (visibility = 'public' AND screening = 'clear'))
      AND "userId" = ${userId} AND "createdAt" >= ${utcTimestamp(since)}
    GROUP BY 1
  `

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    count: Number(row.count),
  }))
}

/**
 * A Date as a raw-SQL value comparable with Prisma's DateTime columns.
 *
 * Those columns are `timestamp without time zone` holding UTC, but Prisma
 * sends a Date parameter as `timestamptz`. Comparing the two makes Postgres
 * read the column in the session's TimeZone, which on a server set to
 * Asia/Shanghai moved every raw-SQL boundary by eight hours: a day filter or
 * heatmap window disagreed with the same filter served through Prisma, which
 * compares in UTC. Converting the parameter to UTC wall time keeps both sides
 * as stored, whatever the session's zone.
 */
export function utcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`
}

/** Inclusive UTC bounds for a YYYY-MM-DD day, matching how the heatmap counts. */
export function utcDayRange(day: string): { gte: Date; lt: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const start = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { gte: start, lt: end }
}

/** The preview strips on a profile, one for each piece of gear it lists. */
export interface GearPreviews {
  byCamera: Map<string, PreviewPhoto[]>
  byFilm: Map<string, PreviewPhoto[]>
}

/** For a blocked profile, which lists no gear at all. */
export function noGearPreviews(): GearPreviews {
  return { byCamera: new Map(), byFilm: new Map() }
}

/**
 * Up to four preview photos for each camera and film stock a photographer uses.
 *
 * Picked in SQL. Previously the page loaded every photo the profile owned and
 * walked the list to collect four per piece of gear, which meant fetching
 * hundreds of records to display a handful.
 */
export async function getGearPreviews(
  userId: string,
  viewerId?: string | null
): Promise<GearPreviews> {
  // A photographer sees their own private and unpublished frames in their own
  // gear strips. Nobody else does.
  const own = viewerId === userId
  const scope = Prisma.sql`
    kind = 'community' AND "uploadComplete" AND "deletedAt" IS NULL AND (${own}::boolean OR (visibility = 'public' AND screening = 'clear'))
    AND "userId" = ${userId}
  `

  const [byCamera, byFilm] = await Promise.all([
    previewPhotosByGear({ key: 'cameraId', parents: 'all', where: scope, order: 'recent' }),
    previewPhotosByGear({ key: 'filmStockId', parents: 'all', where: scope, order: 'recent' }),
  ])

  return {
    byCamera: groupPreviews(byCamera, 'cameraId'),
    byFilm: groupPreviews(byFilm, 'filmStockId'),
  }
}

export interface ProfilePhoto {
  id: string
  thumbnailPath: string
  mediumPath: string | null
  width: number
  height: number
  blurHash: string | null
  caption: string | null
  cameraId: string | null
  filmStockId: string | null
  createdAt: Date
  likes_count: number
  /**
   * The gear, as `photoAlt` wants it. These arrive as json_build_object
   * results, so the shape is declared rather than inferred from an include.
   * `manufacturer` is in the list because `displayName` prefers it over brand
   * for a film, and leaving it out changes the alt text.
   */
  filmStock: { name: string; brand: string | null; manufacturer: string | null } | null
  camera: { name: string; brand: string | null } | null
}

/**
 * First page of a profile's grid, in the order the profile was opened in.
 *
 * Ordered by the same md5(id || seed) expression /api/photos uses for its
 * random tab, because the profile defaults to the featured sort and the grid
 * pages through that endpoint. Rendering this page by date instead — which is
 * what an ordinary Prisma orderBy would give — left the first screen and its
 * continuation in different orders, so photos were duplicated and others became
 * unreachable.
 *
 * The column list is what the grid renders plus what `photoAlt` reads. The
 * caption and the two gear joins were missing, so the first thirty tiles said
 * "Film photograph" and everything scrolled in after them — served by
 * /api/photos, which does select them — carried the full description. One grid
 * described the same photographs two different ways, and the alt attribute is
 * the only thing describing a scan to an image crawler. The joins are on
 * unique ids, so they multiply no rows out of the ordering.
 *
 * The order is the sort in the URL. This page was always the featured
 * shuffle, so a profile opened at ?sort=recent showed a shuffle under a lit
 * Recent button, then scrolled on from the 31st newest photo, repeating some
 * and never reaching others. Recent and popular use feedOrderBy's ordering
 * and tiebreakers, so the scroll continues where this page ends.
 *
 * The CASE WHENs yield SQL NULL for a photo with no film stock or camera, so
 * the relation arrives as a real null rather than the string 'null'.
 */
export async function getProfileFirstPage(
  userId: string,
  seed: number,
  take: number,
  viewerId?: string | null,
  order: ProfileSort = 'featured'
): Promise<ProfilePhoto[]> {
  const ownVisible = viewerId === userId
  const orderBy =
    order === 'recent' ? Prisma.sql`p."createdAt" DESC, p.id DESC`
    : order === 'popular' ? Prisma.sql`likes_count DESC, p."createdAt" DESC, p.id DESC`
    : Prisma.sql`md5(p.id || ${seed})`
  return prisma.$queryRaw<ProfilePhoto[]>`
    SELECT p.id, p."thumbnailPath", p."mediumPath", p.width, p.height, p."blurHash",
           p.caption, p."cameraId", p."filmStockId", p."createdAt",
           CASE WHEN f.id IS NULL THEN NULL
                ELSE json_build_object('name', f.name, 'brand', f.brand,
                                       'manufacturer', f.manufacturer) END as "filmStock",
           CASE WHEN c.id IS NULL THEN NULL
                ELSE json_build_object('name', c.name, 'brand', c.brand) END as camera,
           (SELECT COUNT(*)::int FROM "Like" WHERE "photoId" = p.id) AS likes_count
    FROM "Photo" p
    LEFT JOIN "FilmStock" f ON p."filmStockId" = f.id
    LEFT JOIN "Camera" c ON p."cameraId" = c.id
    WHERE p.kind = 'community' AND p."uploadComplete" AND p."deletedAt" IS NULL AND (${ownVisible}::boolean OR (p.visibility = 'public' AND p.screening = 'clear'))
      AND p."userId" = ${userId}
    ORDER BY ${orderBy}
    LIMIT ${take}
  `
}
