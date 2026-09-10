import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/seo/site'
import { PHOTOS_PER_SHARD } from '@/lib/seo/sitemapConfig'
import { buildUrlset, xmlResponse } from '@/lib/seo/xml'
import { photoAlt, photoTitle } from '@/lib/seo/alt'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'

/**
 * Photo sitemap shard: /sitemaps/photos/0.xml, /sitemaps/photos/1.xml, ...
 *
 * Each entry carries a Google <image:image> block pointing at the actual scan,
 * with a title and caption built from the film stock, camera, and photographer.
 * That text is what a Google Images query gets matched against — a bare
 * <image:loc> with no descriptive text is close to useless for a photo that
 * contains no extractable text of its own.
 */

export const revalidate = 3600

export async function GET(_req: Request, { params }: { params: Promise<{ shard: string }> }) {
  // The route is /sitemaps/photos/[shard], and the .xml suffix is part of the
  // param rather than a separate segment — Next has no literal-extension syntax
  // for dynamic segments.
  const { shard } = await params
  const shardIndex = Number(shard.replace(/\.xml$/, ''))
  if (!Number.isInteger(shardIndex) || shardIndex < 0) notFound()

  const photos = await prisma.photo.findMany({
    where: { ...PUBLIC_PHOTO },
    select: {
      id: true,
      updatedAt: true,
      mediumPath: true,
      caption: true,
      takenDate: true,
      filmStock: { select: { name: true, brand: true } },
      camera: { select: { name: true, brand: true } },
      user: { select: { name: true, username: true } },
    },
    /**
     * Oldest first, and with a tiebreaker.
     *
     * Two separate problems, both of which dropped URLs. `createdAt` alone is
     * not a total order, so photos sharing a timestamp could be skipped by one
     * page's OFFSET and repeated by the next. And sharding newest-first means
     * every upload shifts the whole sequence: shard 0 is regenerated, shard 1
     * is still serving an hour-old copy, and the photos that moved across the
     * boundary between them appear in neither, so those pages are never
     * submitted at all.
     *
     * Ascending, new photos only ever land at the end. Every earlier shard
     * covers a fixed window and stops changing.
     */
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: shardIndex * PHOTOS_PER_SHARD,
    take: PHOTOS_PER_SHARD,
  })

  if (photos.length === 0) notFound()

  return xmlResponse(
    buildUrlset(
      photos.map((photo) => ({
        loc: `${SITE_URL}/photos/${photo.id}`,
        lastmod: photo.updatedAt,
        changefreq: 'monthly' as const,
        priority: 0.5,
        images: [
          {
            loc: photo.mediumPath,
            title: photoTitle(photo),
            caption: photoAlt(photo),
          },
        ],
      }))
    )
  )
}
