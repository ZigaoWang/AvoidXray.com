import { prisma } from '@/lib/db'
import { randomSeed } from '@/lib/seededShuffle'

/**
 * The photographs shown beside the sign-in and join forms.
 *
 * The auth pages were a logo and a form on an empty black page — the one part
 * of the site that shows none of what the site is for, at the moment somebody
 * is deciding whether to bother. This puts real frames from the archive next
 * to the form, which is both the honest argument for joining and the one that
 * needs no copy.
 *
 * It used to carry three totals as well, for a row of counted figures under
 * the collage. The figures were a second pitch on a page that only has to ask
 * for an email address, so they and their three count queries are gone.
 */

/**
 * Enough that three columns overflow the tallest viewport rather than running
 * out partway down.
 *
 * The showcase is pinned to the full height of the screen, and the columns are
 * packed at each photograph's own aspect ratio, so the total height depends on
 * what got drawn. Twelve left black space under the collage beside the sign-up
 * form, which is the tallest of the four.
 */
const SHOWCASE_PHOTOS = 18

export interface ShowcasePhoto {
  id: string
  thumbnailPath: string
  width: number
  height: number
  blurHash: string | null
}

export interface AuthShowcase {
  photos: ShowcasePhoto[]
}

export async function getAuthShowcase(): Promise<AuthShowcase> {
  // Ordered by a hash of the id against a fresh seed, which is how the explore
  // feed already draws a random page. This first took the newest sixty and
  // rotated a window through them, so the panel only ever showed recent
  // uploads — the archive it is meant to advertise was invisible past the last
  // few weeks, and a quiet month made it look like the same photographs every
  // visit.
  //
  // Doing it in the database rather than fetching and shuffling keeps the cost
  // flat as the archive grows; nothing is loaded but the twelve rows shown.
  const seed = randomSeed()

  const photos = await prisma.$queryRaw<ShowcasePhoto[]>`
    SELECT id, "thumbnailPath", width, height, "blurHash"
    FROM "Photo"
    WHERE kind = 'community' AND "uploadComplete" AND "deletedAt" IS NULL AND visibility = 'public' AND screening = 'clear'
    ORDER BY md5(id || ${String(seed)})
    LIMIT ${SHOWCASE_PHOTOS}
  `

  return { photos }
}
