import { prisma } from '@/lib/db'
import { searchAmong } from '@/lib/vision'
import { queryNamesGear } from '@/lib/catalogSearch'

/**
 * The owner's photos that match a search: by what they show (the vision
 * worker's text search, over this owner's photos only) or by their words
 * (caption, file name, the roll's title, location and notes, and the names of
 * the film, camera and lab). Either is enough. A query that names gear is
 * answered by its words alone, as on the site (queryNamesGear).
 *
 * `ids` is every match. `lookalike` is the ones only the worker found, best
 * first, which the library shows after the rest as photos that look like the
 * query: the model ranks the closest-looking photos there are, so a place
 * never shot still finds some.
 *
 * When the vision worker is not answering, the words alone are searched, and
 * `contentSearched` says so, so the page can tell the owner.
 */
export async function searchLibrary(ownerId: string, query: string): Promise<{ ids: string[]; lookalike: string[]; contentSearched: boolean }> {
  const q = query.trim().slice(0, 200)
  if (!q) return { ids: [], lookalike: [], contentSearched: true }
  const like = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`

  const [byWords, own, namesGear] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Photo" p
      LEFT JOIN "Roll" r ON r.id = p."rollId"
      LEFT JOIN "FilmStock" f ON f.id = p."filmStockId"
      LEFT JOIN "Camera" c ON c.id = p."cameraId"
      LEFT JOIN "Lab" l ON l.id = p."labId"
      WHERE p."userId" = ${ownerId} AND p.kind = 'community' AND p."deletedAt" IS NULL
        AND (p.caption ILIKE ${like} OR p."originalFilename" ILIKE ${like}
          OR r.title ILIKE ${like} OR r.location ILIKE ${like} OR r.notes ILIKE ${like}
          OR f.name ILIKE ${like} OR c.name ILIKE ${like} OR l.name ILIKE ${like})`,
    prisma.photo.findMany({
      where: { userId: ownerId, kind: 'COMMUNITY', deletedAt: null, uploadComplete: true },
      select: { id: true },
    }),
    queryNamesGear(q),
  ])
  const byContent = own.length && !namesGear ? await searchAmong(q, own.map(p => p.id)) : []
  const named = new Set(byWords.map(p => p.id))
  const lookalike = (byContent ?? []).map(m => m.id).filter(id => !named.has(id))
  return { ids: [...named, ...lookalike], lookalike, contentSearched: byContent !== null }
}
