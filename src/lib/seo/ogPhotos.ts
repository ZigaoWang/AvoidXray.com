import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * How many rows to draw the sample from.
 *
 * Ordering in the database with `ORDER BY random()` would mean writing the
 * visibility predicate as raw SQL, and photoVisibility.ts is explicit that the
 * rule belongs in one constant rather than being restated per query. Pulling a
 * capped pool of ids and shuffling in memory keeps `where` a real
 * Prisma.PhotoWhereInput, and a thousand short strings is nothing next to the
 * image work that follows.
 */
const POOL = 1000

/** Fisher-Yates, matching the shuffle on the homepage. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * A random spread of thumbnail URLs for an og:image collage.
 *
 * Random rather than newest: these cards are cached for an hour or a day, so
 * ordering by date meant every regeneration drew the same frames and the
 * collage only moved when someone uploaded. A shuffle makes each regeneration
 * a different view of the gallery.
 */
export async function randomTileUrls(
  where: Prisma.PhotoWhereInput,
  count: number,
): Promise<string[]> {
  const pool = await prisma.photo.findMany({
    where,
    select: { thumbnailPath: true },
    orderBy: { createdAt: 'desc' },
    take: POOL,
  })

  return shuffle(pool.map((p) => p.thumbnailPath)).slice(0, count)
}
