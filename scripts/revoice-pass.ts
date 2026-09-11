/**
 * Rewrites catalog prose that is already published, without changing its facts.
 *
 * Distinct from rewrite-pass.ts, which submits *new* research and demands a
 * source URL under every claim. This one exists for the other job: forty-three
 * entries that were each written correctly and none of which were written to
 * match one another. Lengths ran from twelve words to a hundred and thirty,
 * some opened by restating the summary, and a "reviewers report" tic appeared
 * four times in a single paragraph. None of that is a sourcing problem and none
 * of it is fixable by researching harder.
 *
 * Because it introduces no claim, it carries no citation, and the provenance
 * already recorded against these fields keeps applying. That is only true while
 * the rule below holds, so it is the one rule worth stating: an entry here may
 * cut a fact or say it in fewer words, and may not add one. Anything new goes
 * through rewrite-pass.ts with a source under it.
 *
 * Applied as an admin edit, which still writes a Revision and is still
 * reviewable after the fact. Nothing here bypasses the pipeline.
 *
 *   npx tsx scripts/revoice-pass.ts scripts/rewrite/revoice-films.json [--apply]
 *
 * Without --apply it checks every entry and writes nothing.
 */
import { readFileSync } from 'node:fs'
import { PrismaClient, type EntityType } from '@prisma/client'
import { applyAdminEdit } from '../src/lib/revisions'
import { SUMMARY_MAX, SUMMARY_MIN } from '../src/lib/catalogForm'

const prisma = new PrismaClient()

interface Entry {
  entityType: EntityType
  /** Matched by name, because ids are not readable in a content file. */
  name: string
  summary: string
  /** One string per paragraph. Joined with blank lines on the way in. */
  description: string[]
}

const MARKETING =
  /\b(iconic|legendary|cult classic|beloved|ultra-affordable|stunning|amazing|must-have|game-changing|revolutionary)\b/i
const SUPERLATIVE = /\b(the only|the best|the most)\b|\bthe first\b(?!\s+\d)/i
const ATTRIBUTED =
  /\b(kodak|ilford|fujifilm|canon|nikon|olympus|harman|lomography|reviewers?|labs?|the manufacturer) (says|calls|claims|describes|rates|reports|positions)\b/i

/**
 * The house rules that can be checked mechanically, applied before the write
 * rather than found afterwards by the audit.
 *
 * Same checks audit-catalog-prose.ts runs, plus the two typographic ones from
 * CONTRIBUTING that no script enforced anywhere: no em dashes and no
 * exclamation marks. Both had to be caught by eye until now.
 */
function problems(entry: Entry): string[] {
  const found: string[] = []
  const summary = entry.summary.trim()
  const description = entry.description.join('\n\n').trim()

  // `summaryFromDescription` reads this paragraph back as the entry's summary,
  // and answers null outside this range — so an opening line that misses it
  // leaves the page with no lead sentence. Checked here so the failure names
  // the entry rather than turning up later as a blank field.
  if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    found.push(`summary is ${summary.length} characters, needs ${SUMMARY_MIN} to ${SUMMARY_MAX}`)
  }
  if (!description) found.push('no description')

  // The summary is now the description's opening paragraph rather than a
  // separate column, so a body that repeats it says the same thing twice.
  const first = entry.description[0]?.trim().toLowerCase() ?? ''
  if (first === summary.toLowerCase()) found.push('the body repeats the summary')
  const lead = entry.name.split(/\s+/).slice(0, 2).join(' ').toLowerCase()
  if (first.startsWith(lead) || first.startsWith(`the ${lead}`)) {
    found.push('description opens by restating the name')
  }

  const marketing = description.match(MARKETING)
  if (marketing) found.push(`banned word: "${marketing[0]}"`)

  const superlative = description.match(SUPERLATIVE)
  if (superlative && !ATTRIBUTED.test(description)) {
    found.push(`unattributed superlative: "${superlative[0]}"`)
  }

  for (const [label, pattern] of [
    ['em dash', /—/],
    ['exclamation mark', /!/],
  ] as const) {
    // Yes!Star is a brand, and the exclamation mark in it is part of a name
    // rather than punctuation we chose.
    const text = description.replace(/Yes!Star/g, 'YesStar')
    if (pattern.test(text)) found.push(`contains an ${label}`)
  }

  return found
}

async function findEntity(entry: Entry) {
  if (entry.entityType === 'FILM_STOCK') {
    return prisma.filmStock.findFirst({ where: { name: entry.name }, select: { id: true } })
  }
  return prisma.camera.findFirst({ where: { name: entry.name }, select: { id: true } })
}

async function main() {
  const [, , file, ...flags] = process.argv
  const apply = flags.includes('--apply')

  if (!file) {
    console.error('usage: tsx scripts/revoice-pass.ts <batch.json> [--apply]')
    process.exit(1)
  }

  const batch: Entry[] = JSON.parse(readFileSync(file, 'utf8'))
  const admin = await prisma.user.findFirstOrThrow({ where: { isAdmin: true }, select: { id: true } })

  let done = 0
  let skipped = 0

  for (const entry of batch) {
    const found = problems(entry)
    if (found.length > 0) {
      console.error(`  SKIP  ${entry.name}: ${found.join('; ')}`)
      skipped++
      continue
    }

    const target = await findEntity(entry)
    if (!target) {
      console.error(`  SKIP  ${entry.name}: no such record`)
      skipped++
      continue
    }

    // One field. The summary is the description's opening paragraph, and is
    // computed where it is shown rather than stored beside it.
    const payload = {
      description: [entry.summary.trim(), ...entry.description.map(p => p.trim())].join('\n\n'),
    }

    if (!apply) {
      const words = payload.description.split(/\s+/).length
      console.log(`  would edit  ${entry.name.padEnd(40)} ${words} words in ${entry.description.length} paragraphs`)
      done++
      continue
    }

    const result = await applyAdminEdit(entry.entityType, target.id, payload, admin.id)
    if ('error' in result) {
      console.error(`  FAIL  ${entry.name}: ${result.error}`)
      skipped++
      continue
    }
    console.log(`  edited  ${entry.name}`)
    done++
  }

  console.log(`\n  ${done} ${apply ? 'edited' : 'ready'}, ${skipped} skipped`)
  await prisma.$disconnect()
  process.exit(skipped === 0 ? 0 : 1)
}

main().catch(async error => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
