import { prisma } from '@/lib/db'
import { SITE_URL } from '@/lib/seo/site'
import { PHOTOS_PER_SHARD } from '@/lib/seo/sitemapConfig'
import { buildSitemapIndex, xmlResponse } from '@/lib/seo/xml'

/**
 * Sitemap index. This is the URL already submitted in Google Search Console and
 * referenced from robots.txt, so it must keep working and must enumerate every
 * shard.
 *
 * Shards are split by content type rather than purely by size: GSC reports
 * coverage per sitemap, which makes "are my photo pages getting indexed?" a
 * question you can answer at a glance.
 */

export const revalidate = 3600

export async function GET() {
  const [totalPhotos, newestPhoto] = await Promise.all([
    prisma.photo.count({ where: { published: true } }),
    prisma.photo.findFirst({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  const lastmod = newestPhoto?.createdAt ?? new Date()
  const shards = Math.max(1, Math.ceil(totalPhotos / PHOTOS_PER_SHARD))

  return xmlResponse(
    buildSitemapIndex([
      { loc: `${SITE_URL}/sitemaps/hubs.xml`, lastmod },
      ...Array.from({ length: shards }, (_, i) => ({
        loc: `${SITE_URL}/sitemaps/photos/${i}.xml`,
        lastmod,
      })),
    ])
  )
}
