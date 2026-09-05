/**
 * Approves every field of every pending revision.
 *
 * For clearing a queue whose contents have already been read, after something
 * upstream refused them for the wrong reason. Not a substitute for the review
 * screen: it accepts everything and asks nothing, so it is only correct when
 * the decision has already been made somewhere else.
 *
 *   npx tsx scripts/apply-pending.ts [--apply]
 */
import { PrismaClient } from '@prisma/client'
import { reviewRevision } from '../src/lib/revisions'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const pending = await prisma.revision.findMany({
    where: { status: 'PENDING' },
    orderBy: { submittedAt: 'asc' },
  })

  const reviewer = await prisma.user.findFirstOrThrow({
    where: { isAdmin: true },
    select: { id: true },
  })

  let applied = 0
  let failed = 0

  for (const revision of pending) {
    const fields = Object.keys(revision.payload as Record<string, unknown>)
    const label = `${revision.entityType} ${revision.entityId?.slice(0, 8)}`

    if (!apply) {
      console.log(`  would apply  ${label}  (${fields.join(', ')})`)
      continue
    }

    const result = await reviewRevision(revision.id, {
      approve: fields,
      reject: {},
      reviewedById: reviewer.id,
    })

    if ('error' in result) {
      console.error(`  FAILED  ${label}: ${result.error}`)
      failed++
      continue
    }

    // A field that was approved and did not land is the interesting case: it
    // means something below the queue refused it, which is what happened when
    // the summary column was missing from the editable allowlist.
    const missed = fields.filter(f => !result.applied.includes(f))
    console.log(
      `  applied  ${label}  ${result.applied.join(', ')}` +
        (missed.length ? `  NOT APPLIED: ${missed.join(', ')}` : '')
    )
    if (missed.length) failed++
    applied++
  }

  console.log(`\n  ${applied} applied, ${failed} with problems`)
  await prisma.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main()
