import { prisma } from '@/lib/db'
import { SITE_URL } from '@/lib/seo/site'
import { buildSitemapIndex, xmlResponse } from '@/lib/seo/xml'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'

/**
 * Sitemap index. This is the URL already submitted in Google Search Console and
 * referenced from robots.txt, so it must keep working and must enumerate every
 * child sitemap.
 *
 * Photo pages had their own shards until they were made noindex; submitting
 * URLs that ask not to be indexed only earns Search Console errors. What is
 * left is the hub sitemap, kept behind an index so another can join it later
 * without resubmitting.
 */

export const revalidate = 3600

export async function GET() {
  const newestPhoto = await prisma.photo.findFirst({
    where: { ...PUBLIC_PHOTO },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  return xmlResponse(
    buildSitemapIndex([
      { loc: `${SITE_URL}/sitemaps/hubs.xml`, lastmod: newestPhoto?.createdAt ?? new Date() },
    ])
  )
}
