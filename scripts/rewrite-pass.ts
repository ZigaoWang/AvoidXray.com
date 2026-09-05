/**
 * Submits written catalogue entries as revisions, in batches.
 *
 * The pass never writes to a record. Every entry becomes a proposal that lands
 * in /admin/revisions with its citations attached, and a person decides. That
 * is the whole point: a rewrite that wrote forty descriptions directly would be
 * the thing this catalogue exists not to be, just in better prose.
 *
 * Content lives in scripts/rewrite/*.json, one file per batch. Each entry
 * carries the fields it proposes and a source URL per field. A field with no
 * source is not submitted, which is enforced here and again by a CHECK on the
 * table for anything model-sourced.
 *
 *   npx tsx scripts/rewrite-pass.ts scripts/rewrite/batch-01.json [--apply]
 *
 * Without --apply it prints what it would submit and changes nothing.
 */
import { readFileSync } from 'node:fs'
import { PrismaClient, type EntityType } from '@prisma/client'
import { submitRevision } from '../src/lib/revisions'

const prisma = new PrismaClient()

interface Entry {
  entityType: EntityType
  /** Matched by name, because ids are not readable in a content file. */
  name: string
  fields: Record<string, string>
  /** Field name to the URL that was fetched and read for it. */
  sources: Record<string, string>
  /** Why anything expected is absent. For the reviewer, not stored. */
  omitted?: Record<string, string>
}

const [, , file, ...flags] = process.argv
const apply = flags.includes('--apply')

if (!file) {
  console.error('usage: tsx scripts/rewrite-pass.ts <batch.json> [--apply]')
  process.exit(1)
}

async function findEntity(entry: Entry) {
  if (entry.entityType === 'FILM_STOCK') {
    return prisma.filmStock.findFirst({ where: { name: entry.name }, select: { id: true } })
  }
  return prisma.camera.findFirst({ where: { name: entry.name }, select: { id: true } })
}

async function main() {
  const batch: Entry[] = JSON.parse(readFileSync(file, 'utf8'))
  let submitted = 0
  let skipped = 0

  for (const entry of batch) {
    const target = await findEntity(entry)
    if (!target) {
      console.error(`  SKIP  ${entry.name}: no such record`)
      skipped++
      continue
    }

    // A field with no source is not proposed. The standard requires the page to
    // have been fetched and read, which cannot be verified from here, so this
    // checks the weaker thing it can: that a URL was recorded at all.
    const uncited = Object.keys(entry.fields).filter(f => !entry.sources[f])
    if (uncited.length > 0) {
      console.error(`  SKIP  ${entry.name}: no source for ${uncited.join(', ')}`)
      skipped++
      continue
    }

    // Summaries are capped in the database. Failing here names the entry;
    // failing there names a constraint.
    const summary = entry.fields.summary
    if (summary && (summary.length < 20 || summary.length > 200)) {
      console.error(`  SKIP  ${entry.name}: summary is ${summary.length} characters, needs 20 to 200`)
      skipped++
      continue
    }

    if (!apply) {
      console.log(`  would submit  ${entry.name}  (${Object.keys(entry.fields).join(', ')})`)
      submitted++
      continue
    }

    await submitRevision({
      entityType: entry.entityType,
      entityId: target.id,
      payload: entry.fields,
      sourceUrls: entry.sources,
      // Written by a person against sources they read, not generated. RESEARCH
      // rather than LLM, and it goes to the same queue either way.
      source: 'RESEARCH',
      submittedById: null,
    })
    console.log(`  submitted  ${entry.name}`)
    submitted++
  }

  console.log(`\n  ${submitted} ${apply ? 'submitted' : 'ready'}, ${skipped} skipped`)
  await prisma.$disconnect()
  process.exit(skipped === 0 ? 0 : 1)
}

main()
