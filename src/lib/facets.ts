/**
 * Faceted filtering for a catalog index: which records match, and what each
 * filter chip would match if it were pressed next.
 *
 * The indexes used to count every chip against the whole catalog, so with B&W
 * applied the Tungsten chip still offered a number and pressing it led to an
 * empty page. A chip's count here is taken with every other filter applied and
 * its own group set aside, which is the answer to "what happens if I press
 * this".
 */

export interface Facet<T> {
  key: string
  /** The value applied for this group, if any. */
  active: string | undefined
  /** The value a record carries for this group. */
  valueOf: (record: T) => string | null | undefined
}

export interface FacetResult<T> {
  /** Records matching every applied filter. */
  matches: T[]
  /** Per group, per value: records that pressing it would show. */
  counts: Record<string, Record<string, number>>
  /** Per group, the values any record carries, most common first. */
  present: Record<string, string[]>
}

export function applyFacets<T>(records: T[], facets: Facet<T>[]): FacetResult<T> {
  const passes = (record: T, skip?: string) =>
    facets.every(f => f.key === skip || !f.active || f.valueOf(record) === f.active)

  const counts: Record<string, Record<string, number>> = {}
  const present: Record<string, string[]> = {}

  for (const facet of facets) {
    const group: Record<string, number> = {}
    const overall = new Map<string, number>()
    for (const record of records) {
      const value = facet.valueOf(record)
      if (!value) continue
      overall.set(value, (overall.get(value) ?? 0) + 1)
      if (passes(record, facet.key)) group[value] = (group[value] ?? 0) + 1
    }
    counts[facet.key] = group
    present[facet.key] = [...overall.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value)
  }

  return { matches: records.filter(r => passes(r)), counts, present }
}
