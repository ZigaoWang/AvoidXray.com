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

/**
 * A paragraph and the page its claims came from.
 *
 * The unit of citation is the unit that can be wrong on its own. A field-level
 * citation puts one URL under two hundred words, so a description carrying a
 * datasheet fact and a lab blog's characterisation records only one of them and
 * the other silently inherits a source that does not support it. That happened
 * on the first entry written this way.
 */
interface Claim {
  text: string
  /** The page that was fetched and read for this paragraph. */
  source?: string
  /**
   * Judgment in the site's voice rather than a claim a source could settle:
   * how a film looks, how a camera handles, what it is good for. Marked rather
   * than left uncited, so it is not mistaken for missing work.
   */
  editorial?: true
}

interface Entry {
  entityType: EntityType
  /** Matched by name, because ids are not readable in a content file. */
  name: string
  /** A string with one source, or paragraphs that each carry their own. */
  fields: Record<string, string | Claim[]>
  /** Sources for whole-field values. Paragraphs carry theirs inline. */
  sources?: Record<string, string>
  /** Why anything expected is absent. For the reviewer, not stored. */
  omitted?: Record<string, string>
  /** What changed since a previous draft, and why. */
  fixed?: Record<string, string>
}

/** The text written to the column, and the citations recorded beside it. */
function resolveField(
  value: string | Claim[],
  fallback: string | undefined
): { text: string; sources: Array<{ claim: string; url?: string; editorial?: true }> } {
  if (typeof value === 'string') {
    return {
      text: value,
      sources: fallback ? [{ claim: value.slice(0, 60), url: fallback }] : [],
    }
  }

  return {
    text: value.map(c => c.text).join('\n\n'),
    // The opening words identify which paragraph a citation belongs to, so a
    // reviewer can see that the second one rests on a different page, or that
    // it is house voice and needs none.
    sources: value.map(c =>
      c.editorial
        ? { claim: c.text.slice(0, 60), editorial: true as const }
        : { claim: c.text.slice(0, 60), url: c.source }
    ),
  }
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

    // Every claim needs a source. The standard requires the page to have been
    // fetched and read, which cannot be verified from here, so this checks the
    // weaker thing it can: that a URL was recorded for every claim.
    const payload: Record<string, string> = {}
    const sourceUrls: Record<string, Array<{ claim: string; url?: string; editorial?: true }>> = {}
    const uncited: string[] = []

    for (const [field, value] of Object.entries(entry.fields)) {
      const resolved = resolveField(value, entry.sources?.[field])
      payload[field] = resolved.text
      sourceUrls[field] = resolved.sources
      // Editorial paragraphs need no URL. Everything else does.
      if (
        resolved.sources.length === 0 ||
        resolved.sources.some(s => !s.editorial && !s.url)
      ) {
        uncited.push(field)
      }
    }

    if (uncited.length > 0) {
      console.error(`  SKIP  ${entry.name}: a claim has no source in ${uncited.join(', ')}`)
      skipped++
      continue
    }

    // Summaries are capped in the database. Failing here names the entry;
    // failing there names a constraint.
    const summary = payload.summary
    if (summary && (summary.length < 20 || summary.length > 200)) {
      console.error(`  SKIP  ${entry.name}: summary is ${summary.length} characters, needs 20 to 200`)
      skipped++
      continue
    }

    if (!apply) {
      const counts = Object.entries(sourceUrls)
        .map(([f, list]) => {
          const cited = list.filter(c => !c.editorial).length
          const editorial = list.length - cited
          return `${f}: ${cited} cited${editorial ? `, ${editorial} editorial` : ''}`
        })
        .join(', ')
      console.log(`  would submit  ${entry.name}  (${counts})`)
      submitted++
      continue
    }

    await submitRevision({
      entityType: entry.entityType,
      entityId: target.id,
      payload,
      sourceUrls: sourceUrls as unknown as Record<string, string>,
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
