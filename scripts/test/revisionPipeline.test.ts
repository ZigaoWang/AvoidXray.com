/**
 * Exercises the revision pipeline against a real database.
 *
 * Unlike the other tests here this one needs a database, because what it checks
 * is transactional behavior: that the entity write, the version bump and the
 * provenance row land together. Point DATABASE_URL at a clone, never at
 * production. It restores what it changes, but a test that writes is a test
 * that can leave a mess if it dies partway.
 *
 *   DATABASE_URL=<clone> npx tsx scripts/test/revisionPipeline.test.ts
 *
 * It refuses to run unless the database name contains "test" or "clone", or
 * ALLOW_DB_TEST=1 is set. It edits the first film stock it finds, and a .env
 * still pointing at the real database was the only thing between it and a
 * live catalog record.
 *
 * The claim being checked is that an administrator's edit is one action that
 * still leaves a diff, a version bump and provenance, all in one transaction.
 * That is the whole argument for removing the immediate path, so it is worth
 * proving rather than assuming.
 */
import { PrismaClient } from '@prisma/client'
import { applyAdminEdit, submitRevision, reviewRevision } from '../../src/lib/revisions'

/** The database DATABASE_URL names, or null if it cannot be read. */
function databaseName(): string | null {
  // Prisma reads .env on its own, so the URL it will use may not be in the
  // environment yet. Read the same file so the check sees the same database.
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile('.env')
    } catch {
      // No .env; the URL has to come from the environment.
    }
  }
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)) || null
  } catch {
    return null
  }
}

const dbName = databaseName()
if (process.env.ALLOW_DB_TEST !== '1' && !/test|clone/i.test(dbName ?? '')) {
  console.error(
    `Refusing to run against database "${dbName ?? '(unknown)'}". This test writes to a real film stock. ` +
      'Point DATABASE_URL at a database whose name contains "test" or "clone", or set ALLOW_DB_TEST=1.'
  )
  process.exit(1)
}

const prisma = new PrismaClient()
let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.error(`  FAIL ${name} ${detail}`) }
}

async function main() {
  const stock = await prisma.filmStock.findFirstOrThrow({ select: { id: true, version: true, iso: true } })
  const admin = await prisma.user.findFirstOrThrow({ where: { isAdmin: true }, select: { id: true } })
  const originalIso = stock.iso

  // 1. An admin edit is one call and lands immediately.
  const result = await applyAdminEdit('FILM_STOCK', stock.id, { iso: 125 }, admin.id)
  check('admin edit applies', !('error' in result) && result.applied.includes('iso'), JSON.stringify(result))

  const after = await prisma.filmStock.findUniqueOrThrow({
    where: { id: stock.id },
    select: { iso: true, version: true },
  })
  check('value written', after.iso === 125, `iso is ${after.iso}`)
  check('version bumped', after.version === stock.version + 1, `version ${stock.version} -> ${after.version}`)

  // 2. Provenance was written in the same transaction, which the old path did not do.
  const prov = await prisma.fieldProvenance.findUnique({
    where: {
      entityType_entityId_fieldName: { entityType: 'FILM_STOCK', entityId: stock.id, fieldName: 'iso' },
    },
  })
  check('provenance written', prov?.source === 'ADMIN', `source ${prov?.source}`)
  check('admin edit counts as verified', prov?.verifiedAt !== null && prov?.verifiedById === admin.id)

  // 3. The history exists.
  const revision = await prisma.revision.findFirst({
    where: { entityId: stock.id }, orderBy: { submittedAt: 'desc' },
  })
  check('revision recorded', revision?.status === 'APPROVED', `status ${revision?.status}`)
  check('diff holds only the changed field',
    JSON.stringify(revision?.payload) === JSON.stringify({ iso: 125 }), JSON.stringify(revision?.payload))

  // 4. Partial approval: one field lands, one is refused with a reason.
  const proposal = await submitRevision({
    entityType: 'FILM_STOCK',
    entityId: stock.id,
    payload: { iso: 800, caption: 'not a field on this record' },
    source: 'USER',
    submittedById: admin.id,
  })
  const partial = await reviewRevision(proposal.id, {
    approve: ['iso'],
    reject: { caption: 'Not something this record has' },
    reviewedById: admin.id,
  })
  check('partial applies the approved field', !('error' in partial) && partial.applied.includes('iso'))
  check('partial refuses the rest', !('error' in partial) && partial.rejected.includes('caption'))

  const partialRow = await prisma.revision.findUniqueOrThrow({ where: { id: proposal.id } })
  check('partial recorded as PARTIAL', partialRow.status === 'PARTIAL', partialRow.status)

  // 5. A rejection is an event, not a standing judgement: the same value can be
  //    proposed again and accepted.
  const again = await submitRevision({
    entityType: 'FILM_STOCK', entityId: stock.id,
    payload: { caption: 'now with a reason to accept it' },
    source: 'USER', submittedById: admin.id,
  })
  const readmitted = await reviewRevision(again.id, { approve: ['caption'], reject: {}, reviewedById: admin.id })
  check('a previously refused field can be proposed again',
    !('error' in readmitted), JSON.stringify(readmitted))

  // 6. A stale draft does not overwrite a newer value.
  const stale = await prisma.revision.create({
    data: {
      entityType: 'FILM_STOCK', entityId: stock.id,
      baseVersion: 1, payload: { iso: 3200 }, source: 'USER', submittedById: admin.id,
    },
  })
  const staleResult = await reviewRevision(stale.id, { approve: ['iso'], reject: {}, reviewedById: admin.id })
  check('stale draft is held back',
    !('error' in staleResult) && staleResult.stale.includes('iso'), JSON.stringify(staleResult))

  const untouched = await prisma.filmStock.findUniqueOrThrow({ where: { id: stock.id }, select: { iso: true } })
  check('newer value survived the stale draft', untouched.iso !== 3200, `iso is ${untouched.iso}`)

  // Leave the clone as found, for a repeatable run.
  await prisma.filmStock.update({ where: { id: stock.id }, data: { iso: originalIso } })

  // 7. A lab goes through the same door. It brings its own row, since a fresh
  //    database has no labs, and removes it again at the end.
  await prisma.lab.deleteMany({ where: { id: 'test_pipeline_lab' } })
  const lab = await prisma.lab.create({
    data: { id: 'test_pipeline_lab', slug: 'test-pipeline-lab', name: 'Test Pipeline Lab' },
  })
  try {
    const labEdit = await applyAdminEdit(
      'LAB', lab.id,
      { name: 'Test Pipeline Lab Renamed', city: 'Testville', website: 'https://example.invalid/lab' },
      admin.id
    )
    check('lab admin edit applies',
      !('error' in labEdit) && ['name', 'city', 'website'].every(f => labEdit.applied.includes(f)),
      JSON.stringify(labEdit))

    const labAfter = await prisma.lab.findUniqueOrThrow({ where: { id: lab.id } })
    check('lab version bumped', labAfter.version === lab.version + 1, `version ${lab.version} -> ${labAfter.version}`)
    check('lab slug follows the name', labAfter.slug === 'test-pipeline-lab-renamed', labAfter.slug)

    const labProv = await prisma.fieldProvenance.findMany({ where: { entityType: 'LAB', entityId: lab.id } })
    check('lab provenance written per field',
      labProv.length === 3 && labProv.every(p => p.source === 'ADMIN'),
      JSON.stringify(labProv.map(p => [p.fieldName, p.source])))

    // A website a link cannot safely carry is refused at approval, whatever
    // path proposed it, and the rest of the proposal still lands.
    const labProposal = await submitRevision({
      entityType: 'LAB', entityId: lab.id,
      payload: { website: 'javascript:alert(1)', country: 'Testland' },
      source: 'USER', submittedById: admin.id,
    })
    const labReview = await reviewRevision(labProposal.id, {
      approve: ['website', 'country'], reject: {}, reviewedById: admin.id,
    })
    check('lab website must be http or https',
      !('error' in labReview) && labReview.rejected.includes('website') && labReview.applied.includes('country'),
      JSON.stringify(labReview))
    const labWebsite = await prisma.lab.findUniqueOrThrow({ where: { id: lab.id }, select: { website: true } })
    check('refused website left unchanged', labWebsite.website === 'https://example.invalid/lab', String(labWebsite.website))
  } finally {
    await prisma.lab.deleteMany({ where: { id: lab.id } })
  }
  const labLeftovers = await prisma.fieldProvenance.count({ where: { entityType: 'LAB', entityId: lab.id } })
  check('deleting a lab takes its provenance', labLeftovers === 0, `${labLeftovers} rows left`)

  console.log(`\n  ${pass} passed, ${fail} failed`)
  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main()
