import { prisma } from '@/lib/db'
import { SITE_URL, comboUrl } from '@/lib/seo/site'
import { getFilmCameraPairs } from '@/lib/seo/pairs'
import { buildUrlset, xmlResponse, type SitemapUrl } from '@/lib/seo/xml'
import { gearImageAlt } from '@/lib/seo/alt'

/**
 * Hub sitemap: static routes, film stocks, cameras, film x camera combinations,
 * and photographer profiles. These are the pages meant to rank in web search.
 *
 * `lastmod` comes from real row timestamps. The previous sitemap stamped every
 * URL with build time, which teaches Google to ignore the field entirely.
 */

export const revalidate = 3600

export async function GET() {
  const [films, cameras, users, pairs, newestPhoto] = await Promise.all([
    prisma.filmStock.findMany({
      where: { photos: { some: { published: true } } },
      select: {
        id: true, slug: true, name: true, brand: true,
        updatedAt: true, imageUrl: true, imageStatus: true,
      },
    }),
    prisma.camera.findMany({
      where: { photos: { some: { published: true } } },
      select: {
        id: true, slug: true, name: true, brand: true,
        updatedAt: true, imageUrl: true, imageStatus: true,
      },
    }),
    prisma.user.findMany({
      where: { photos: { some: { published: true } } },
      select: { username: true, createdAt: true },
    }),
    getFilmCameraPairs(),
    prisma.photo.findFirst({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  // Index pages change whenever any photo lands, so they inherit the newest
  // upload date rather than claiming to be freshly modified on every build.
  const feedFreshness = newestPhoto?.createdAt ?? new Date()

  const urls: SitemapUrl[] = [
    { loc: SITE_URL, lastmod: feedFreshness, changefreq: 'daily', priority: 1 },
    { loc: `${SITE_URL}/explore`, lastmod: feedFreshness, changefreq: 'daily', priority: 0.9 },
    { loc: `${SITE_URL}/films`, lastmod: feedFreshness, changefreq: 'weekly', priority: 0.9 },
    { loc: `${SITE_URL}/cameras`, lastmod: feedFreshness, changefreq: 'weekly', priority: 0.9 },
    { loc: `${SITE_URL}/discover/albums`, lastmod: feedFreshness, changefreq: 'weekly', priority: 0.6 },

    ...films.map((film) => ({
      loc: `${SITE_URL}/films/${film.slug ?? film.id}`,
      lastmod: film.updatedAt,
      changefreq: 'weekly' as const,
      priority: 0.8,
      ...(film.imageStatus === 'approved' && film.imageUrl
        ? { images: [{ loc: film.imageUrl, title: gearImageAlt(film, 'film') }] }
        : {}),
    })),

    ...cameras.map((camera) => ({
      loc: `${SITE_URL}/cameras/${camera.slug ?? camera.id}`,
      lastmod: camera.updatedAt,
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
      lastmod: user.createdAt,
      changefreq: 'weekly' as const,
      priority: 0.6,
    })),
  ]

  return xmlResponse(buildUrlset(urls))
}
