import { Prisma } from '@prisma/client'
import { prisma } from './db'

/**
 * Matching a catalogue record by its name or by a name it is also sold under.
 *
 * Both halves of the catalogue have the same problem. A film stock is "5219" to
 * anyone buying Vision3 500T in 35mm, and a camera body sold as the Mju in one
 * market is the Stylus in another. A record stored under one name is simply
 * unfindable to everyone who knows it by the other.
 *
 * One function rather than one per entity, because two implementations of the
 * same search drift and the drift is invisible: the symptom is a record that
 * one page can find and another cannot, which is exactly what happened when
 * aliases were matched with array containment in some callers and not others.
 *
 * Aliases go through raw SQL because Prisma cannot express a case-insensitive
 * comparison inside an array column. `hasSome` is exact containment, so "5219"
 * matched but "vision" never matched "VISION3 500T". Unnesting and comparing
 * with ILIKE makes an alias behave like any other searchable text.
 */

export interface CatalogueMatch {
  id: string
  /** The alias responsible, when the name itself did not match. For display. */
  matchedAlias: string | null
}

/**
 * The tables this searches, and the extra text columns each one matches on
 * beyond its name.
 *
 * A closed set, and the only reason it is safe to interpolate a table name into
 * the query below. Nothing here comes from a request.
 */
const ENTITIES = {
  film: {
    table: Prisma.raw('"FilmStock"'),
    extraColumns: [Prisma.raw('e.manufacturer'), Prisma.raw('e.brand')],
  },
  camera: {
    table: Prisma.raw('"Camera"'),
    // Brand is matched through the relation rather than the legacy text column,
    // which is populated on almost no rows since brands became their own table.
    extraColumns: [Prisma.raw('b.name')],
  },
} as const

export type CatalogueEntity = keyof typeof ENTITIES

/**
 * Matching ids, most relevant first: exact name, then name prefix, then
 * anything else.
 */
export async function searchCatalogue(
  entity: CatalogueEntity,
  query: string,
  limit = 50
): Promise<CatalogueMatch[]> {
  const q = query.trim()
  if (!q) return []

  const like = `%${q}%`
  const { table, extraColumns } = ENTITIES[entity]

  // Left joined for every entity so one query shape serves both. A film's brand
  // relation is unused by its extraColumns and costs an indexed lookup.
  const extraMatches = Prisma.join(
    extraColumns.map(col => Prisma.sql`${col} ILIKE ${like}`),
    ' OR '
  )

  return prisma.$queryRaw<CatalogueMatch[]>`
    SELECT e.id,
           (
             SELECT a FROM unnest(e."aliases") AS a
             WHERE a ILIKE ${like}
             LIMIT 1
           ) AS "matchedAlias"
    FROM ${table} e
    LEFT JOIN "Brand" b ON b.id = e."brandId"
    WHERE e.name ILIKE ${like}
       OR ${extraMatches}
       OR EXISTS (SELECT 1 FROM unnest(e."aliases") AS a WHERE a ILIKE ${like})
    ORDER BY
      (lower(e.name) = lower(${q})) DESC,
      (lower(e.name) LIKE lower(${q}) || '%') DESC,
      e.name ASC
    LIMIT ${limit}
  `
}

/**
 * Alternate names worth showing beside a record, minus any that only repeat
 * what the name already says. "Kentmere 400" adds nothing next to "Kentmere Pan
 * 400"; "5219" does.
 */
export function usefulAliases(name: string, aliases: string[]): string[] {
  const haystack = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return aliases.filter(a => !haystack.includes(a.toLowerCase().replace(/[^a-z0-9]/g, '')))
}

/** Client-side equivalent, for pickers that already hold the full list. */
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
