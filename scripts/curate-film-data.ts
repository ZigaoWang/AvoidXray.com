/**
 * Curated film stock facts.
 *
 * Applies verified values for process, colour balance and aliases, and reports
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
 * Colour balance for ordinary C-41 colour negative film is daylight; that is
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
      'Motion picture stock, still carrying its remjet, so ECN-2. 5219 is the 35mm catalogue number and 7219 the 16mm one.',
  },
  {
    name: 'Ferrania P30',
    process: 'B&W',
    colorBalance: 'N/A',
    source: 'Panchromatic black and white, so colour balance does not apply.',
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
    name: 'Kodak Gold 800',
    issue:
      'Kodak has no current stock by this name. Its ISO 800 colour negative is Portra 800; the consumer high-speed stocks were Gold Max / Ultra Max 800 and are discontinued. This row is probably mislabelled — confirm what it actually is before its process and balance mean anything.',
  },
  {
    name: 'Orwo Wolfen NC400',
    issue:
      'Runs in either C-41 or ECN-2, since it has no remjet, and retailers disagree on whether it is daylight or tungsten balanced. Left alone rather than picking a side. C-41 is the safer default if you want one, as that is how it is sold for stills.',
  },
  {
    name: 'Yes!Star 400',
    issue:
      'Could not establish a manufacturer. Nothing in the name matches a known maker and it does not appear in any reliable listing — likely a rebadged stock. Needs someone who has held the box.',
  },
]

async function main() {
  console.log(`\nCurating film data${DRY_RUN ? ' — dry run, nothing written' : ''}\n`)

  const films = await prisma.filmStock.findMany({
    select: {
      id: true,
      name: true,
      manufacturer: true,
      process: true,
      colorBalance: true,
      aliases: true,
    },
  })
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

  const stillNull = await prisma.filmStock.findMany({
    where: { OR: [{ process: null }, { manufacturer: null }] },
    select: { name: true, process: true, manufacturer: true },
    orderBy: { name: 'asc' },
  })
  if (stillNull.length > 0) {
    console.log(`\n${stillNull.length} row(s) still incomplete:`)
    for (const f of stillNull) {
      const missing = [!f.process && 'process', !f.manufacturer && 'manufacturer'].filter(Boolean)
      console.log(`  - ${f.name}: missing ${missing.join(', ')}`)
    }
  }
  console.log()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
