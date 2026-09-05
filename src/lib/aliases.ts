/**
 * Helpers for alternate names, usable on either side of the network.
 *
 * Deliberately importing nothing. These are needed by the pickers in the
 * browser and by the search endpoint on the server, and when they lived beside
 * the database query the whole Prisma client followed them into the client
 * bundle and every page threw on load.
 */

/**
 * Alternate names worth showing beside a record, minus any that only repeat
 * what the name already says. "Kentmere 400" adds nothing next to "Kentmere Pan
 * 400"; "5219" does.
 */
export function usefulAliases(name: string, aliases: string[]): string[] {
  const haystack = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return aliases.filter(a => !haystack.includes(a.toLowerCase().replace(/[^a-z0-9]/g, '')))
}

/** For pickers that already hold the full list and filter in the browser. */
export function matchesQuery(
  record: { name: string; aliases?: string[] } & Record<string, unknown>,
  query: string,
  extraFields: string[] = []
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (record.name.toLowerCase().includes(q)) return true
  for (const field of extraFields) {
    const value = record[field]
    if (typeof value === 'string' && value.toLowerCase().includes(q)) return true
  }
  return (record.aliases ?? []).some(a => a.toLowerCase().includes(q))
}
