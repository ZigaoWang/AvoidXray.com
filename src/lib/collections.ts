import { prisma } from '@/lib/db'
import { PUBLIC_ARCHIVE_PHOTO } from '@/lib/photoVisibility'

/**
 * Collections: the public domain archives the site imports from, browsed by
 * source. Read-only on ArchiveSource, ArchiveRecord and their photos; the
 * import owns those tables and nothing here writes to them.
 */

/** A source's photos in the order they were imported, which is the archive's. */
const COLLECTION_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }]

/**
 * One page of a source's photos, shaped for the photo grid. The archive's
 * title stands in for a caption, so a tile's alt text is the record's.
 */
export async function collectionPhotoPage(sourceId: string, { skip = 0, take }: { skip?: number; take: number }) {
  const rows = await prisma.photo.findMany({
    where: { ...PUBLIC_ARCHIVE_PHOTO, archiveRecord: { sourceId } },
    orderBy: COLLECTION_ORDER,
    skip,
    take,
    select: {
      id: true, thumbnailPath: true, mediumPath: true, width: true, height: true, blurHash: true,
      filmStock: { select: { name: true, brand: true, manufacturer: true } },
      archiveRecord: { select: { originalTitle: true } },
    },
  })
  return rows.map(({ archiveRecord, ...photo }) => ({ ...photo, caption: archiveRecord?.originalTitle ?? null }))
}

/** How many photos each source has that anyone may see. */
export async function collectionPhotoCounts(): Promise<Map<string, number>> {
  const rows = await prisma.archiveRecord.groupBy({
    by: ['sourceId'],
    where: { photo: PUBLIC_ARCHIVE_PHOTO },
    _count: { _all: true },
  })
  return new Map(rows.map(r => [r.sourceId, r._count._all]))
}
