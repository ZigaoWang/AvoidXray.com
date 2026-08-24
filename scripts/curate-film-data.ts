/**
 * Curated film stock facts.
 *
 * Applies verified values for process, color balance and aliases, and reports
 * anything that could not be established. Idempotent and safe to re-run: it
 * only writes fields whose current value differs, and never clears a value that
 * is already set unless this file states otherwise.
 *
 *   npx tsx scripts/curate-film-data.ts --dry
 *   npx tsx scripts/curate-film-data.ts
 *
 * Entries carry a `source` note explaining anything non-obvious, so a later
 * reader can tell a checked fact from an assumption.
 */

import { PrismaClient } from '@prisma/client'
import { toColorBalance, toFilmProcess } from '../src/lib/filmFields'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry')

interface Curated {
  /** Matched case-insensitively against the stored name. */
  name: string
  manufacturer?: string
  process?: string
  colorBalance?: string
  aliases?: string[]
  /** Why, where it is not self-evident. */
  source?: string
}

/**
 * Color balance for ordinary C-41 color negative film is daylight; that is
 * what the process is designed around. Only stocks that depart from it are
 * called out below, so the common case is stated once rather than twenty times.
 */
const DAYLIGHT_C41 = [
  'Fujicolor 400',
  'Fujifilm 400',
  'Fujifilm Superia Premium 400',
  'Fujifilm Superia X-TRA 400',
  'Harman Phoenix II 200',
  'Ilford IlfoColor 400 Plus',
  'Ilford Ilfocolor Vivid 400',
  'Kodak ColorPlus 200',
  'Kodak Gold 200',
  'Kodak Portra 800',
  'Kodak UltraMax 400',
  "LomoChrome Color '92 Sun-Kissed",
  'Lomography Color Negative 400',
  'Lucky Color C200',
]

const CURATED: Curated[] = [
  ...DAYLIGHT_C41.map((name) => ({ name, process: 'C-41', colorBalance: 'Daylight' })),

  {
    name: 'Cinestill 800T',
    process: 'C-41',
    colorBalance: 'Tungsten',
    aliases: ['800T'],
    source:
      'Motion picture emulsion with the remjet removed, which is what makes it C-41 rather than ECN-2. Tungsten balanced at 3200K.',
  },
  {
    name: 'Kodak Vision3 500T (5219)',
    process: 'ECN-2',
    colorBalance: 'Tungsten',
    aliases: ['5219', '7219', 'VISION3 500T', '500T'],
    source:
      'Motion picture stock, still carrying its remjet, so ECN-2. 5219 is the 35mm catalog number and 7219 the 16mm one.',
  },
  {
    name: 'Kodak Gold 800',
    process: 'C-41',
    colorBalance: 'Daylight',
    source:
      'The emulsion loaded in Kodak FunSaver single-use cameras, which Kodak names Gold 800 in its own copy for them. It is not sold as a loose cassette, which is why it does not appear in retail film listings.',
  },
  {
    name: 'Yes!Star 400',
    manufacturer: 'Yes!Star',
    process: 'C-41',
    colorBalance: 'Daylight',
    source:
      'Chinese-made color negative film sold under the Yes!Star name, which is what stands as the manufacturer. Little is documented about it beyond that, so nothing further is claimed here.',
  },
  {
    name: 'Orwo Wolfen NC400',
    process: 'C-41',
    source:
      'Confirmed as C-41. Color balance is deliberately left unset: the film has no remjet and runs in either C-41 or ECN-2, and sellers disagree on whether it is daylight or tungsten balanced.',
  },
  {
    name: 'Ferrania P30',
    process: 'B&W',
    colorBalance: 'N/A',
    source: 'Panchromatic black and white, so color balance does not apply.',
  },
  {
    name: 'Kentmere Pan400',
    manufacturer: 'Harman',
    process: 'B&W',
    colorBalance: 'N/A',
    aliases: ['Kentmere 400'],
    source: 'Kentmere is Harman Technology, the same company behind Ilford.',
  },
]

/**
 * Rows this script deliberately will not fill, with the reason.
 *
 * Recorded here rather than silently skipped, so the gap is visible and does
 * not get quietly closed with a guess later.
 */
const NEEDS_A_DECISION: Array<{ name: string; issue: string }> = [
  {
    name: 'Orwo Wolfen NC400',
    issue:
      'Process confirmed as C-41. Color balance still open — the film runs in either C-41 or ECN-2 and sellers describe it as both daylight and tungsten balanced. Left unset rather than picking one.',
  },
]

async function main() {
  console.log(`\nCurating film data${DRY_RUN ? ' — dry run, nothing written' : ''}\n`)

  // Read raw: once scripts/sql/004 made `process` NOT NULL, the generated
  // types stopped admitting a null for it, so a database that still has one
  // could not be read through the client — which is the database this script
  // exists to fix.
  const films = await prisma.$queryRaw<
    {
      id: string
      name: string
      manufacturer: string | null
      process: string | null
      colorBalance: string | null
      aliases: string[]
    }[]
  >`
    SELECT id, name, manufacturer, process::text AS process,
           "colorBalance"::text AS "colorBalance", aliases
    FROM "FilmStock"
  `
  const byName = new Map(films.map((f) => [f.name.toLowerCase(), f]))

  let updated = 0
  const notFound: string[] = []

  for (const entry of CURATED) {
    const film = byName.get(entry.name.toLowerCase())
    if (!film) {
      notFound.push(entry.name)
      continue
    }

    const data: Record<string, unknown> = {}
    const changes: string[] = []

    if (entry.manufacturer && film.manufacturer !== entry.manufacturer) {
      data.manufacturer = entry.manufacturer
      changes.push(`manufacturer ${film.manufacturer ?? '(none)'} -> ${entry.manufacturer}`)
    }

    const process = toFilmProcess(entry.process)
    if (process && film.process !== process) {
      data.process = process
      changes.push(`process ${film.process ?? '(none)'} -> ${entry.process}`)
    }

    const balance = toColorBalance(entry.colorBalance)
    if (balance && film.colorBalance !== balance) {
      data.colorBalance = balance
      changes.push(`colorBalance ${film.colorBalance ?? '(none)'} -> ${entry.colorBalance}`)
    }

    if (entry.aliases) {
      // Union with what is already stored, so aliases added by hand survive.
      const merged = [...new Set([...film.aliases, ...entry.aliases])]
      if (merged.length !== film.aliases.length) {
        data.aliases = merged
        changes.push(`aliases +[${merged.filter((a) => !film.aliases.includes(a)).join(', ')}]`)
      }
    }

    if (changes.length === 0) continue
    updated++
    console.log(`  ${film.name}`)
    for (const change of changes) console.log(`      ${change}`)
    if (entry.source) console.log(`      note: ${entry.source}`)

    if (!DRY_RUN) {
      await prisma.filmStock.update({ where: { id: film.id }, data })
    }
  }

  console.log(`\n${updated} row(s) ${DRY_RUN ? 'would be updated' : 'updated'}`)

  if (notFound.length > 0) {
    console.log(`\nNot present in the database (${notFound.length}):`)
    for (const name of notFound) console.log(`  - ${name}`)
  }

  console.log(`\n${'='.repeat(72)}`)
  console.log('LEFT ALONE ON PURPOSE')
  console.log('='.repeat(72))
  for (const item of NEEDS_A_DECISION) {
    console.log(`\n  ${item.name}`)
    console.log(`      ${item.issue}`)
  }

  // process is NOT NULL as of scripts/sql/004, so only manufacturer can still
  // be missing here.
  const stillNull = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM "FilmStock"
    WHERE manufacturer IS NULL OR process IS NULL
    ORDER BY name ASC
  `
  if (stillNull.length > 0) {
    console.log(`\n${stillNull.length} row(s) still incomplete:`)
    for (const f of stillNull) console.log(`  - ${f.name}`)
  }
  console.log()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
