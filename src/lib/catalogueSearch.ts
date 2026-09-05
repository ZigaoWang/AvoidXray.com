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
    table: '"FilmStock"',
    extraColumns: ['e.manufacturer', 'e.brand'],
  },
  camera: {
    table: '"Camera"',
    // Brand is matched through the relation rather than the legacy text column,
    // which is populated on almost no rows since brands became their own table.
    extraColumns: ['b.name'],
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
  const entityConfig = ENTITIES[entity]

  // Built here rather than at module scope. Prisma.raw runs on evaluation, and
  // this module is reachable from the client bundle through the film search
  // helpers; a top-level call crashed every page with "raw is unable to run in
  // this browser environment". Plain strings until the query is actually run.
  const table = Prisma.raw(entityConfig.table)
  const extraColumns = entityConfig.extraColumns.map(c => Prisma.raw(c))

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
