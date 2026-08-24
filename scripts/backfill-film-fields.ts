/**
 * Backfill process, colour balance, manufacturer and aliases on film stocks.
 *
 * Run after scripts/sql/003-film-stock-fields.sql. Idempotent: a row that
 * already has a value keeps it, so this can be re-run after filling gaps by
 * hand without undoing that work.
 *
 *   npx tsx scripts/backfill-film-fields.ts --dry    # report only
 *   npx tsx scripts/backfill-film-fields.ts
 *
 * Anything it cannot determine is left null and printed at the end, with the
 * reason. Guessing at a required field is worse than an empty one — a wrong
 * process silently mis-files a stock in the browse filters, where nobody would
 * notice it was wrong.
 */

import { PrismaClient, type FilmProcess, type ColorBalance } from '@prisma/client'
import {
  inferAliases,
  inferManufacturer,
  inferProcessFields,
} from '../src/lib/filmFields'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry')

/** Display value -> Prisma enum member. */
const PROCESS_ENUM: Record<string, FilmProcess> = {
  'C-41': 'C41',
  'E-6': 'E6',
  'ECN-2': 'ECN2',
  'B&W': 'BW',
  Other: 'OTHER',
}
const BALANCE_ENUM: Record<string, ColorBalance> = {
  Daylight: 'DAYLIGHT',
  Tungsten: 'TUNGSTEN',
  'N/A': 'NA',
}

interface Unresolved {
  name: string
  slug: string | null
  field: string
  reason: string
}

async function main() {
  const films = await prisma.filmStock.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      brand: true,
      manufacturer: true,
      filmType: true,
      description: true,
      process: true,
      colorBalance: true,
      aliases: true,
      format: true,
    },
  })

  console.log(`\n${films.length} film stock(s)${DRY_RUN ? ' — dry run, nothing written' : ''}\n`)

  const unresolved: Unresolved[] = []
  let changed = 0

  for (const film of films) {
    const update: Record<string, unknown> = {}
    const applied: string[] = []

    // ---- manufacturer (required) ----
    if (!film.manufacturer) {
      // An existing brand is authoritative; otherwise read it off the name.
      const inferred = film.brand?.trim() || inferManufacturer(film.name)
      if (inferred) {
        update.manufacturer = inferred
        applied.push(`manufacturer=${inferred}`)
      } else {
        unresolved.push({
          name: film.name,
          slug: film.slug,
          field: 'manufacturer',
          reason: 'no known manufacturer at the start of the name',
        })
      }
    }

    // ---- process + colour balance ----
    const inference = inferProcessFields(film)

    if (!film.process) {
      if (inference.process) {
        update.process = PROCESS_ENUM[inference.process]
        applied.push(`process=${inference.process}`)
      } else {
        unresolved.push({
          name: film.name,
          slug: film.slug,
          field: 'process',
          reason: inference.note ?? 'could not be determined',
        })
      }
    }

    if (!film.colorBalance) {
      if (inference.colorBalance) {
        update.colorBalance = BALANCE_ENUM[inference.colorBalance]
        applied.push(`colorBalance=${inference.colorBalance}`)
      } else if (inference.process !== null || inference.note) {
        unresolved.push({
          name: film.name,
          slug: film.slug,
          field: 'colorBalance',
          reason: inference.note ?? 'not implied by the film type',
        })
      }
    }

    // ---- aliases (additive; never removes ones added by hand) ----
    if (film.aliases.length === 0) {
      const inferred = inferAliases(film.name)
      if (inferred.length > 0) {
        update.aliases = inferred
        applied.push(`aliases=[${inferred.join(', ')}]`)
      }
    }

    if (applied.length === 0) continue
    changed++
    console.log(`  ${film.name}`)
    for (const line of applied) console.log(`      ${line}`)

    if (!DRY_RUN) {
      await prisma.filmStock.update({ where: { id: film.id }, data: update })
    }
  }

  console.log(`\n${changed} row(s) ${DRY_RUN ? 'would be updated' : 'updated'}`)

  // Formats should have been wrapped by the migration; report any that were not.
  const missingFormat = films.filter((f) => f.format.length === 0)
  if (missingFormat.length > 0) {
    console.log(`\n${missingFormat.length} row(s) have no format:`)
    for (const f of missingFormat) console.log(`  - ${f.name}`)
  }

  if (unresolved.length === 0) {
    console.log('\nNothing left unresolved.')
    console.log('Apply the NOT NULL constraint with:')
    console.log('  npx prisma db execute --schema prisma/schema.prisma \\')
    console.log('    --file scripts/sql/004-film-process-not-null.sql\n')
    return
  }

  // Grouped by field and reason: eighteen colour stocks all needing the same
  // decision is one line of instruction, not eighteen.
  console.log(`\n${'='.repeat(72)}`)
  console.log(`NEEDS A HUMAN — ${unresolved.length} field(s) left null`)
  console.log('='.repeat(72))

  const groups = new Map<string, Unresolved[]>()
  for (const item of unresolved) {
    const key = `${item.field}|${item.reason}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  // Smallest groups first: a one-off needs attention more than a broad default.
  for (const [key, items] of [...groups].sort((a, b) => a[1].length - b[1].length)) {
    const [field, reason] = key.split('|')
    console.log(`\n  ${field} — ${reason}  (${items.length})`)
    for (const item of items) {
      console.log(`      ${item.name}${item.slug ? `  /films/${item.slug}` : ''}`)
    }
  }
  console.log(
    '\nSet these on the film stock, then re-run this script and apply' +
      '\nscripts/sql/004-film-process-not-null.sql.\n'
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
