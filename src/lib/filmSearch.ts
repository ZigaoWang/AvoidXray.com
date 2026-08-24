import { Prisma } from '@prisma/client'
import { prisma } from './db'

/**
 * Film stock lookup, alternate names included.
 *
 * A stock is known by more than its stored name: Kodak Vision3 500T is "5219"
 * to anyone buying it in 35mm, and Kentmere Pan 400 is often written "Kentmere
 * 400". Those live in the `aliases` array, and searching has to cover them or
 * the stock is simply unfindable by the name people actually use.
 *
 * Aliases were previously matched with Prisma's `hasSome`, which is exact
 * array containment — so "5219" worked but "vision" never matched "VISION3
 * 500T", and a lowercase query only matched if that exact casing happened to
 * be stored. This unnests the array and compares with ILIKE, so alternate
 * names behave like every other searchable field.
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

export interface FilmMatch {
  id: string
  /** The alias that matched, when the name itself did not. For display. */
  matchedAlias: string | null
}

/**
 * Matching ids, most relevant first: exact name, then name prefix, then
 * anything else. Returns the alias responsible for a match so a result can
 * explain itself.
 */
export async function searchFilmStockIds(query: string, limit = 50): Promise<FilmMatch[]> {
  const q = query.trim()
  if (!q) return []

  const like = `%${q}%`

  return prisma.$queryRaw<FilmMatch[]>`
    SELECT f.id,
           (
             SELECT a FROM unnest(f."aliases") AS a
             WHERE a ILIKE ${like}
             LIMIT 1
           ) AS "matchedAlias"
    FROM "FilmStock" f
    WHERE f.name ILIKE ${like}
       OR f.manufacturer ILIKE ${like}
       OR f.brand ILIKE ${like}
       OR EXISTS (SELECT 1 FROM unnest(f."aliases") AS a WHERE a ILIKE ${like})
    ORDER BY
      (lower(f.name) = lower(${q})) DESC,
      (lower(f.name) LIKE lower(${q}) || '%') DESC,
      f.name ASC
    LIMIT ${limit}
  `
}

/**
 * The same idea for a Prisma `where`, for callers that only need filtering and
 * not the matched alias. Aliases still go through a raw subquery, because
 * Prisma cannot express a case-insensitive search inside an array column.
 */
export function filmStockSearchWhere(query: string): Prisma.FilmStockWhereInput {
  const q = query.trim()
  if (!q) return {}
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { manufacturer: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
    ],
  }
}

/**
 * Alternate names worth showing next to a stock, minus any that just repeat
 * what the name already says. "Kentmere 400" adds nothing beside "Kentmere
 * Pan 400"; "5219" does.
 */
export function usefulAliases(name: string, aliases: string[]): string[] {
  const haystack = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return aliases.filter((a) => !haystack.includes(a.toLowerCase().replace(/[^a-z0-9]/g, '')))
}

/** Client-side equivalent, for pickers that already hold the full list. */
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
