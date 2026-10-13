import { displayName, type NamedEntity } from '@/lib/seo/alt'

/**
 * How the film and camera indexes are ordered, and what the chips say.
 *
 * Both were `orderBy: { name: 'asc' }` and nothing else: every record in the
 * database, A to Z, in one ungrouped page, so a body nobody has ever shot sat
 * above the Canon AE-1 with four hundred photographs at exactly the same size
 * and weight. The only way to find anything worth looking at was to scroll and
 * hope. Alphabetical is still here, because it is how you find a record whose
 * name you already know — it is just no longer the only offer.
 */

export const CATALOG_SORTS = ['photos', 'recent', 'name'] as const

export type CatalogSort = (typeof CATALOG_SORTS)[number]

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  photos: 'Most photographed',
  // Newly popular gear sat under the long-standing favorites by count alone.
  recent: 'Recently shot',
  name: 'A–Z',
}

/** Anything unrecognized falls back to the default, which is by photo count. */
export function toCatalogSort(value: string | undefined): CatalogSort {
  return value === 'name' || value === 'recent' ? value : 'photos'
}

/**
 * The records in the order the chips asked for.
 *
 * Photo count descending, with the name as the tiebreak so the long tail of
 * entries at zero is still alphabetical rather than in whatever order the
 * database returned them.
 *
 * Both orders go by the name the card prints, not the `name` column. Those
 * differ: the column holds "FM2" and "Sure Shot" while the cards read "Nikon
 * FM2" and "Canon Sure Shot", so an alphabetical page ordered by the column
 * looked to a reader like no order at all.
 */
export function sortCatalog<T extends NamedEntity & { id: string }>(
  records: T[],
  sort: CatalogSort,
  photoCounts: Map<string, number>,
  /** When each was last shot, for the recent order. Never shot sorts last. */
  latest: Map<string, Date> = new Map()
): T[] {
  const label = (record: T) => displayName(record) ?? record.name
  return [...records].sort((a, b) => {
    if (sort === 'recent') {
      const byDate = (latest.get(b.id)?.getTime() ?? 0) - (latest.get(a.id)?.getTime() ?? 0)
      if (byDate !== 0) return byDate
    }
    if (sort === 'photos') {
      const byCount = (photoCounts.get(b.id) ?? 0) - (photoCounts.get(a.id) ?? 0)
      if (byCount !== 0) return byCount
    }
    return label(a).localeCompare(label(b))
  })
}
