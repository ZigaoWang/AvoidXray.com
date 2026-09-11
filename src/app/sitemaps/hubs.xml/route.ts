import { prisma } from '@/lib/db'
import { SITE_URL, comboUrl } from '@/lib/seo/site'
import { getFilmCameraPairs } from '@/lib/seo/pairs'
import { buildUrlset, xmlResponse, type SitemapUrl } from '@/lib/seo/xml'
import { gearImageAlt } from '@/lib/seo/alt'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'

/**
 * Hub sitemap: static routes, film stocks, cameras, film x camera combinations,
 * and photographer profiles. These are the pages meant to rank in web search.
 *
 * `lastmod` comes from real row timestamps. The previous sitemap stamped every
 * URL with build time, which teaches Google to ignore the field entirely.
 */

export const revalidate = 3600

/** The later of two timestamps, either of which may be missing. */
function newest(a: Date | undefined, b: Date | undefined): Date | undefined {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

/** Keep only the latest date seen for a key. */
function keepNewest(map: Map<string, Date>, key: string, at: Date): void {
  const current = map.get(key)
  if (!current || at > current) map.set(key, at)
}

export async function GET() {
  const [films, cameras, users, pairs, newestPhoto, byOwner, byGear] = await Promise.all([
    prisma.filmStock.findMany({
      where: { photos: { some: { ...PUBLIC_PHOTO } } },
      select: {
        id: true, slug: true, name: true, brand: true,
        updatedAt: true, imageUrl: true, imageStatus: true,
      },
    }),
    prisma.camera.findMany({
      where: { photos: { some: { ...PUBLIC_PHOTO } } },
      select: {
        id: true, slug: true, name: true, brand: true,
        updatedAt: true, imageUrl: true, imageStatus: true,
      },
    }),
    prisma.user.findMany({
      where: { photos: { some: { ...PUBLIC_PHOTO } } },
      select: { id: true, username: true, createdAt: true },
    }),
    getFilmCameraPairs(),
    prisma.photo.findFirst({
      where: { ...PUBLIC_PHOTO },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    // A profile, a film page and a camera page all change when a photo lands on
    // them, so their freshness lives in the photo table, not in the row's own
    // columns. Two grouped queries answer that for every hub at once; a query
    // per hub would be thousands of round trips to build one file. Both respect
    // PUBLIC_PHOTO — a private upload must not move a public timestamp, or the
    // sitemap quietly announces when someone uploaded something they hid.
    prisma.photo.groupBy({
      by: ['userId'],
      where: { ...PUBLIC_PHOTO },
      _max: { createdAt: true },
    }),
    prisma.photo.groupBy({
      by: ['filmStockId', 'cameraId'],
      where: { ...PUBLIC_PHOTO },
      _max: { createdAt: true },
    }),
  ])

  // Index pages change whenever any photo lands, so they inherit the newest
  // upload date rather than claiming to be freshly modified on every build.
  const feedFreshness = newestPhoto?.createdAt ?? new Date()

  const freshestByUser = new Map<string, Date>()
  for (const row of byOwner) {
    if (row._max.createdAt) freshestByUser.set(row.userId, row._max.createdAt)
  }

  // One pass over the film x camera groups feeds both maps: a photo carries at
  // most one of each, so the same row's date is the candidate for its film and
  // for its camera, and the pair grouping is the coarsest one that answers both.
  const freshestByFilm = new Map<string, Date>()
  const freshestByCamera = new Map<string, Date>()
  for (const row of byGear) {
    const at = row._max.createdAt
    if (!at) continue
    if (row.filmStockId) keepNewest(freshestByFilm, row.filmStockId, at)
    if (row.cameraId) keepNewest(freshestByCamera, row.cameraId, at)
  }

  const urls: SitemapUrl[] = [
    { loc: SITE_URL, lastmod: feedFreshness, changefreq: 'daily', priority: 1 },
    { loc: `${SITE_URL}/explore`, lastmod: feedFreshness, changefreq: 'daily', priority: 0.9 },
    { loc: `${SITE_URL}/films`, lastmod: feedFreshness, changefreq: 'weekly', priority: 0.9 },
    { loc: `${SITE_URL}/cameras`, lastmod: feedFreshness, changefreq: 'weekly', priority: 0.9 },
    { loc: `${SITE_URL}/discover/albums`, lastmod: feedFreshness, changefreq: 'weekly', priority: 0.6 },

    ...films.map((film) => ({
      loc: `${SITE_URL}/films/${film.slug ?? film.id}`,
      lastmod: newest(film.updatedAt, freshestByFilm.get(film.id)),
      changefreq: 'weekly' as const,
      priority: 0.8,
      ...(film.imageStatus === 'approved' && film.imageUrl
        ? { images: [{ loc: film.imageUrl, title: gearImageAlt(film, 'film') }] }
        : {}),
    })),

    ...cameras.map((camera) => ({
      loc: `${SITE_URL}/cameras/${camera.slug ?? camera.id}`,
      lastmod: newest(camera.updatedAt, freshestByCamera.get(camera.id)),
      changefreq: 'weekly' as const,
      priority: 0.8,
      ...(camera.imageStatus === 'approved' && camera.imageUrl
        ? { images: [{ loc: camera.imageUrl, title: gearImageAlt(camera, 'camera') }] }
        : {}),
    })),

    ...pairs.map((pair) => ({
      loc: `${SITE_URL}${comboUrl(pair.filmSlug, pair.cameraSlug)}`,
      lastmod: feedFreshness,
      changefreq: 'weekly' as const,
      priority: 0.7,
    })),

    ...users.map((user) => ({
      loc: `${SITE_URL}/${user.username}`,
      // Signup date for an account that has published nothing public; anyone
      // else is stamped with their newest public frame.
      lastmod: freshestByUser.get(user.id) ?? user.createdAt,
      changefreq: 'weekly' as const,
      priority: 0.6,
    })),
  ]

  return xmlResponse(buildUrlset(urls))
}
