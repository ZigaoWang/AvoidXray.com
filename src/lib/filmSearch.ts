export { usefulAliases } from './aliases'

/**
 * Film stock helpers that run in the browser.
 *
 * Nothing here may import the database module, directly or transitively. Seven
 * client components import this file for the pickers, so a runtime dependency
 * on Prisma reaching it puts the whole client in the browser bundle. The query
 * itself lives in catalogSearch, which is server only, along with the shape of
 * what it returns — this file had grown a second copy of that shape, field for
 * field, and nothing here may grow another.
 *
 * Film stock lookup, alternate names included.
 *
 * A stock is known by more than its stored name: Kodak Vision3 500T is "5219"
 * to anyone buying it in 35mm, and Kentmere Pan 400 is often written "Kentmere
 * 400". Those live in the `aliases` array, and searching has to cover them or
 * the stock is simply unfindable by the name people actually use.
 */

/**
 * A film stock as the pickers need it.
 *
 * Six files declared their own version of this and only some included
 * aliases, which is why the picker on one page could find "5219" and the
 * picker on another could not.
 */
export interface FilmStockOption {
  id: string
  name: string
  brand: string | null
  manufacturer?: string | null
  imageUrl?: string | null
  aliases?: string[]
}

/** For pickers that already hold the full list and filter in the browser. */
export function filmMatchesQuery(
  film: { name: string; brand?: string | null; manufacturer?: string | null; aliases?: string[] },
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (film.name.toLowerCase().includes(q)) return true
  if (film.manufacturer?.toLowerCase().includes(q)) return true
  if (film.brand?.toLowerCase().includes(q)) return true
  return (film.aliases ?? []).some((a) => a.toLowerCase().includes(q))
}
