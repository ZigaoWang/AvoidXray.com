import { prisma } from '@/lib/db'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'

/**
 * The photographs and figures shown beside the sign-in and join forms.
 *
 * The auth pages were a logo and a form on an empty black page — the one part
 * of the site that shows none of what the site is for, at the moment somebody
 * is deciding whether to bother. This puts real frames from the archive next
 * to the form, which is both the honest argument for joining and the only one
 * that needs no copy.
 *
 * Bounded and cheap on purpose: these pages must stay fast, so it is one small
 * query for the photos and three counts, none of them dependent on the viewer.
 */

/** Enough to fill three columns without the panel repeating itself. */
const SHOWCASE_PHOTOS = 12

/**
 * Drawn from a wider recent pool and rotated by the hour, so the page differs
 * between visits without a random order that would defeat any caching and
 * without loading the whole archive to shuffle it.
 */
const SHOWCASE_POOL = 60

export interface ShowcasePhoto {
  id: string
  thumbnailPath: string
  width: number
  height: number
  blurHash: string | null
  filmStock: { name: string; brand: string | null } | null
}

export interface AuthShowcase {
  photos: ShowcasePhoto[]
  totalPhotos: number
  totalFilms: number
  totalCameras: number
}

export async function getAuthShowcase(): Promise<AuthShowcase> {
  const [pool, totalPhotos, totalFilms, totalCameras] = await Promise.all([
    prisma.photo.findMany({
      where: { ...PUBLIC_PHOTO },
      select: {
        id: true,
        thumbnailPath: true,
        width: true,
        height: true,
        blurHash: true,
        filmStock: { select: { name: true, brand: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: SHOWCASE_POOL,
    }),
    prisma.photo.count({ where: { ...PUBLIC_PHOTO } }),
    prisma.filmStock.count(),
    prisma.camera.count(),
  ])

  // A rotating window rather than Math.random: the server and the client must
  // agree on what was rendered, and an hourly offset gives variety without
  // making every request a different page.
  const offset = pool.length > 0 ? (new Date().getUTCHours() * 5) % pool.length : 0
  const photos = Array.from({ length: Math.min(SHOWCASE_PHOTOS, pool.length) }, (_, i) =>
    pool[(offset + i) % pool.length]
  )

  return { photos, totalPhotos, totalFilms, totalCameras }
}
