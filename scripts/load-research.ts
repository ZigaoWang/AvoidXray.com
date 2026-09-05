/**
 * Loads returned research into the review queue.
 *
 * Takes the JSON shape described in research-brief.md, checks it hard, and
 * submits each entry as a revision. Nothing is written to a record: every
 * result lands in /admin/revisions with its citations attached and a person
 * decides. Research arriving from elsewhere is exactly the input that should
 * not be trusted straight into the catalogue.
 *
 * What it refuses, and why each one has bitten:
 *  - a claim with a source but no passage, which is how a correct citation
 *    became indistinguishable from a careless one
 *  - an enum value the column does not accept, which fails at review time with
 *    a message naming a constraint rather than the entry
 *  - a summary outside 20 to 200 characters, which the database rejects
 *  - a passage that is merely our own sentence repeated back
 *
 *   npx tsx scripts/load-research.ts results.json [--apply]
 */
import { readFileSync } from 'node:fs'
import { PrismaClient, type EntityType } from '@prisma/client'
import { submitRevision } from '../src/lib/revisions'

const prisma = new PrismaClient()

interface Cited {
  value: string | number
  source?: string
  passage?: string
  editorial?: true
}

interface Paragraph {
  text: string
  source?: string
  passage?: string
  editorial?: true
}

interface Result {
  name: string
  entityType: EntityType
  fields?: Record<string, Cited>
  description?: Paragraph[]
  omitted?: Record<string, string>
  notes?: string
}

/** Exactly what each column accepts. Anything else is refused here. */
const ENUMS: Record<string, readonly string[]> = {
  process: ['C41', 'E6', 'ECN2', 'BW', 'OTHER'],
  chromaticity: ['COLOR', 'MONOCHROME'],
  polarity: ['NEGATIVE', 'POSITIVE', 'DIRECT_POSITIVE'],
  colorBalance: ['DAYLIGHT', 'TUNGSTEN', 'NA'],
  manufacturerStatus: ['SAME_AS_BRAND', 'KNOWN', 'ATTRIBUTED', 'UNKNOWN'],
  bodyType: ['SLR', 'RANGEFINDER', 'COMPACT', 'TLR', 'FOLDING', 'VIEW', 'INSTANT', 'DISPOSABLE'],
  frameFormat: ['FULL_FRAME', 'HALF_FRAME', 'PANORAMIC', 'SPROCKET_HOLE'],
}

const [, , file, ...flags] = process.argv
const apply = flags.includes('--apply')

if (!file) {
  console.error('usage: tsx scripts/load-research.ts <results.json> [--apply]')
  process.exit(1)
}

function problemsWith(entry: Result): string[] {
  const problems: string[] = []

  for (const [field, cited] of Object.entries(entry.fields ?? {})) {
    if (cited.editorial) {
      problems.push(`${field}: a specification cannot be house voice`)
      continue
    }
    if (!cited.source) problems.push(`${field}: no source`)
    else if (!cited.passage) problems.push(`${field}: source with no passage`)

    const allowed = ENUMS[field]
    if (allowed && !allowed.includes(String(cited.value))) {
      problems.push(`${field}: "${cited.value}" is not one of ${allowed.join(', ')}`)
    }
  }

  for (const [i, p] of (entry.description ?? []).entries()) {
    if (p.editorial) continue
    if (!p.source) problems.push(`description paragraph ${i + 1}: no source`)
    else if (!p.passage) problems.push(`description paragraph ${i + 1}: source with no passage`)
    // A passage identical to our own sentence means nothing was read; it is
    // the site quoting itself.
    else if (p.passage.trim() === p.text.trim()) {
      problems.push(`description paragraph ${i + 1}: passage is our own sentence`)
    }
  }

  const summary = entry.fields?.summary?.value
  if (typeof summary === 'string' && (summary.length < 20 || summary.length > 200)) {
    problems.push(`summary is ${summary.length} characters, needs 20 to 200`)
  }

  return problems
}

async function findEntity(entry: Result) {
  if (entry.entityType === 'FILM_STOCK') {
    return prisma.filmStock.findFirst({ where: { name: entry.name }, select: { id: true } })
  }
  return prisma.camera.findFirst({ where: { name: entry.name }, select: { id: true } })
}

async function main() {
  const results: Result[] = JSON.parse(readFileSync(file, 'utf8'))
  let submitted = 0
  let skipped = 0

  for (const entry of results) {
    const target = await findEntity(entry)
    if (!target) {
      console.error(`  SKIP  ${entry.name}: no such record`)
      skipped++
      continue
    }

    const problems = problemsWith(entry)
    if (problems.length > 0) {
      console.error(`  SKIP  ${entry.name}`)
      for (const p of problems) console.error(`          ${p}`)
      skipped++
      continue
    }

    const payload: Record<string, unknown> = {}
    const sourceUrls: Record<string, Array<{ claim: string; passage?: string; url?: string; editorial?: true }>> = {}

    for (const [field, cited] of Object.entries(entry.fields ?? {})) {
      payload[field] = cited.value
      sourceUrls[field] = [
        { claim: String(cited.value).slice(0, 60), passage: cited.passage, url: cited.source },
      ]
    }

    if (entry.description?.length) {
      payload.description = entry.description.map(p => p.text).join('\n\n')
      sourceUrls.description = entry.description.map(p =>
        p.editorial
          ? { claim: p.text.slice(0, 60), editorial: true as const }
          : { claim: p.text.slice(0, 60), passage: p.passage, url: p.source }
      )
    }

    if (Object.keys(payload).length === 0) {
      console.error(`  SKIP  ${entry.name}: nothing to propose`)
      skipped++
      continue
    }

    if (!apply) {
      console.log(`  would submit  ${entry.name}  (${Object.keys(payload).join(', ')})`)
      submitted++
      continue
    }

    await submitRevision({
      entityType: entry.entityType,
      entityId: target.id,
      payload,
      sourceUrls: sourceUrls as unknown as Record<string, string>,
      source: 'RESEARCH',
      submittedById: null,
    })
    console.log(`  submitted  ${entry.name}  (${Object.keys(payload).join(', ')})`)
    submitted++
  }

  console.log(`\n  ${submitted} ${apply ? 'submitted' : 'ready'}, ${skipped} skipped`)
  console.log(apply ? '  Review them at /admin/revisions.' : '  Re-run with --apply to submit.')
  await prisma.$disconnect()
}

main()
