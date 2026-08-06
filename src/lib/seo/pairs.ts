import { prisma } from '@/lib/db'

export interface FilmCameraPair {
  filmSlug: string
  filmName: string
  filmBrand: string | null
  cameraSlug: string
  cameraName: string
  cameraBrand: string | null
  count: number
}

/**
 * Every film-stock x camera combination that actually has published photos.
 *
 * These drive the long-tail combination pages ("kodak gold 200 shot on a nikon
 * fm2"), which is the query shape people actually search before buying a roll.
 * Only pairs with at least `minPhotos` frames are returned — a combination page
 * backed by a single photo is exactly the thin content we're trying to avoid.
 */
export async function getFilmCameraPairs(minPhotos = 3): Promise<FilmCameraPair[]> {
  // Prisma's groupBy `having` can't express a threshold on _count._all, so this
  // aggregation is done in SQL.
  const rows = await prisma.$queryRaw<
    Array<{ filmStockId: string; cameraId: string; count: bigint }>
  >`
    SELECT "filmStockId", "cameraId", COUNT(*) AS count
    FROM "Photo"
    WHERE published = true AND "filmStockId" IS NOT NULL AND "cameraId" IS NOT NULL
    GROUP BY "filmStockId", "cameraId"
    HAVING COUNT(*) >= ${minPhotos}
  `

  if (rows.length === 0) return []

  const [films, cameras] = await Promise.all([
    prisma.filmStock.findMany({
      where: { id: { in: rows.map((r) => r.filmStockId) } },
      select: { id: true, slug: true, name: true, brand: true },
    }),
    prisma.camera.findMany({
      where: { id: { in: rows.map((r) => r.cameraId) } },
      select: { id: true, slug: true, name: true, brand: true },
    }),
  ])

  const filmById = new Map(films.map((f) => [f.id, f]))
  const cameraById = new Map(cameras.map((c) => [c.id, c]))

  return rows
    .map((row) => {
      const film = filmById.get(row.filmStockId)
      const camera = cameraById.get(row.cameraId)
      // Unslugged rows can't have a stable URL, so they're skipped rather than
      // published under a cuid that would later need redirecting.
      if (!film?.slug || !camera?.slug) return null

      return {
        filmSlug: film.slug,
        filmName: film.name,
        filmBrand: film.brand,
        cameraSlug: camera.slug,
        cameraName: camera.name,
        cameraBrand: camera.brand,
        count: Number(row.count),
      }
    })
    .filter((p): p is FilmCameraPair => p !== null)
    .sort((a, b) => b.count - a.count)
}
