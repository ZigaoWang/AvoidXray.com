/**
 * Storage limits set from the admin users table, against a real database:
 * the limit is stored in bytes, blank is the default again, and every change
 * leaves one StorageLimitChange naming the admin and both limits.
 *
 *   DATABASE_URL=<throwaway> ALLOW_DB_TEST=1 npx tsx scripts/test/storageLimit.test.ts
 */
import { PrismaClient } from '@prisma/client'

function databaseName(): string | null {
  if (!process.env.DATABASE_URL) {
    try { process.loadEnvFile('.env') } catch { /* no .env */ }
  }
  try { return decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)) || null } catch { return null }
}
const dbName = databaseName()
if (process.env.ALLOW_DB_TEST !== '1' && !/test|clone|trial/i.test(dbName ?? '')) {
  console.error(`Refusing to run against database "${dbName ?? '(unknown)'}". Point DATABASE_URL at a throwaway database or set ALLOW_DB_TEST=1.`)
  process.exit(1)
}

const prisma = new PrismaClient()
let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.error(`  FAIL ${name} ${detail}`) }
}

const P = 'stlim_'
const GB = 1024 ** 3

async function main() {
  const { updateUserWithLimit, bulkUpdateResource } = await import('../../src/lib/admin/repository')
  const { storageUsage, DEFAULT_STORAGE_LIMIT_BYTES } = await import('../../src/lib/library/storage')
  const cleanup = async () => {
    await prisma.storageLimitChange.deleteMany({ where: { userId: { startsWith: P } } })
    await prisma.user.deleteMany({ where: { id: { startsWith: P } } })
  }
  try {
    await cleanup()
    const admin = (await prisma.user.create({ data: { id: `${P}admin`, email: `${P}a@example.invalid`, username: `${P}admin`, passwordHash: 'x', isAdmin: true } })).id
    const member = (await prisma.user.create({ data: { id: `${P}member`, email: `${P}m@example.invalid`, username: `${P}member`, passwordHash: 'x' } })).id
    const changes = () => prisma.storageLimitChange.findMany({ where: { userId: member }, orderBy: { createdAt: 'asc' } })
    const limitOf = async () => (await storageUsage(await prisma.user.findUniqueOrThrow({ where: { id: member }, select: { id: true, isAdmin: true, storageLimitBytes: true } }))).limitBytes

    check('an account starts on the default limit', (await limitOf()) === Number(DEFAULT_STORAGE_LIMIT_BYTES))

    const raised = await updateUserWithLimit(member, { storageLimitGb: 50, name: 'Member' }, admin)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: member } })
    check('a limit in GB is stored in bytes, with the other fields', 'ok' in raised && after.storageLimitBytes === BigInt(50 * GB) && after.name === 'Member')
    check('and is the limit the uploader enforces', (await limitOf()) === 50 * GB)
    let log = await changes()
    check('the change is logged with the admin, old and new limit, and time',
      log.length === 1 && log[0].adminId === admin && log[0].oldBytes === null && log[0].newBytes === BigInt(50 * GB) && log[0].createdAt instanceof Date)

    await updateUserWithLimit(member, { storageLimitGb: 50, name: 'Renamed' }, admin)
    check('saving the same limit again logs nothing', (await changes()).length === 1)

    await updateUserWithLimit(member, { storageLimitGb: null }, admin)
    log = await changes()
    check('blank returns the account to the default, and is logged', (await limitOf()) === Number(DEFAULT_STORAGE_LIMIT_BYTES)
      && log.length === 2 && log[1].oldBytes === BigInt(50 * GB) && log[1].newBytes === null)

    const half = await updateUserWithLimit(member, { storageLimitGb: 2.5 }, admin)
    check('a fractional limit is kept', 'ok' in half && (await limitOf()) === 2.5 * GB)

    const bulk = await bulkUpdateResource('users', [member], { storageLimitGb: 10 })
    check('limits cannot be set on several accounts at once', 'error' in bulk && (await limitOf()) === 2.5 * GB)

    const missing = await updateUserWithLimit(`${P}nobody`, { storageLimitGb: 10 }, admin)
    check('an account that is gone is refused, and nothing is logged', 'error' in missing
      && (await prisma.storageLimitChange.count({ where: { userId: `${P}nobody` } })) === 0)
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
