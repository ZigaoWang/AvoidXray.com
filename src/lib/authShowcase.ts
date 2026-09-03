import { prisma } from '@/lib/db'
import { randomSeed } from '@/lib/seededShuffle'

/**
 * The photographs and figures shown beside the sign-in and join forms.
 *
 * The auth pages were a logo and a form on an empty black page — the one part
 * of the site that shows none of what the site is for, at the moment somebody
 * is deciding whether to bother. This puts real frames from the archive next
 * to the form, which is both the honest argument for joining and the one that
 * needs no copy.
 */

/** Enough to fill three columns without the panel repeating itself. */
const SHOWCASE_PHOTOS = 12

export interface ShowcasePhoto {
  id: string
  thumbnailPath: string
  width: number
  height: number
  blurHash: string | null
}

export interface AuthShowcase {
  photos: ShowcasePhoto[]
  totalPhotos: number
  totalFilms: number
  totalCameras: number
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

  const [photos, totalPhotos, totalFilms, totalCameras] = await Promise.all([
    prisma.$queryRaw<ShowcasePhoto[]>`
      SELECT id, "thumbnailPath", width, height, "blurHash"
      FROM "Photo"
      WHERE published = true AND visibility = 'public'
      ORDER BY md5(id || ${String(seed)})
      LIMIT ${SHOWCASE_PHOTOS}
    `,
    prisma.photo.count({ where: { published: true, visibility: 'PUBLIC' } }),
    prisma.filmStock.count(),
    prisma.camera.count(),
  ])

  return { photos, totalPhotos, totalFilms, totalCameras }
}
