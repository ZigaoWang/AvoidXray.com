/**
 * The credentials gate, which every other permission on the site stands on.
 *
 * Nothing covered it. That is a poor place to have no test: authorize() is the
 * one function that decides whether a request is anybody at all, and three of
 * the things it does are invisible from the outside.
 *
 * The order of its two refusals is one of them. The password is compared
 * before the verified-email check is reached, so a wrong password on an
 * unconfirmed account answers "wrong password" and not "unconfirmed". Reverse
 * those two and the sign-in form tells a stranger which addresses are
 * registered but never confirmed, without their having to know anything. The
 * pre-flight endpoint that used to answer exactly that question was removed
 * for the same reason, so this test is what stops it coming back by another
 * route.
 *
 * Like revisionPipeline, this needs a database, because what it checks is
 * behavior against real rows. Point DATABASE_URL at a clone, never at
 * production. It creates its own account and removes it again.
 *
 *   DATABASE_URL=<clone> npx tsx scripts/test/authGate.test.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { authOptions } from '../../src/lib/auth'
import { __resetRateLimits } from '../../src/lib/rateLimit'
import { LIMITS } from '../../src/lib/rateLimitPolicy'
import { BCRYPT_COST } from '../../src/lib/passwordHash'

const prisma = new PrismaClient()
let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ''}`)
  }
}

/**
 * The provider's authorize, taken from `options` rather than off the provider.
 *
 * CredentialsProvider builds its return value as `{ ...defaults, ...config,
 * authorize: () => null, options: config }` in this version, so the merged
 * object's `authorize` is the library's own stub and the one written in
 * lib/auth survives only under `options`. Calling the wrong one returns null
 * for every input, which reads exactly like a working refusal: the first draft
 * of this test passed its "wrong password is refused" case for that reason and
 * failed everything that needed a real answer.
 */
type Authorize = (
  credentials: Record<string, string> | undefined,
  req: { headers?: Record<string, string> }
) => Promise<unknown>

const authorize = (
  authOptions.providers[0] as unknown as { options: { authorize: Authorize } }
).options.authorize

const IP = { headers: { 'x-real-ip': '203.0.113.7' } }
const PASSWORD = 'correct horse battery staple'
const WRONG = 'incorrect horse battery staple'

/** Refusals are thrown, not returned, so the reason has to be caught. */
async function attempt(email: string, password: string) {
  try {
    const user = await authorize({ email, password }, IP)
    return { user, error: null as string | null }
  } catch (e) {
    return { user: null, error: e instanceof Error ? e.message : String(e) }
  }
}

async function main() {
  const email = `authgate-${process.pid}@example.invalid`
  const username = `authgate_${process.pid}`

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash: await bcrypt.hash(PASSWORD, BCRYPT_COST),
      emailVerified: false,
    },
    select: { id: true },
  })

  try {
    console.log('an unconfirmed account')

    __resetRateLimits()
    const wrongOnUnverified = await attempt(email, WRONG)
    // The important one. If the verified check moved above the password
    // compare, this would come back as EMAIL_NOT_VERIFIED and the form would
    // be an oracle for which addresses exist.
    check('a wrong password is refused without mentioning verification',
      wrongOnUnverified.user === null && wrongOnUnverified.error === null,
      JSON.stringify(wrongOnUnverified))

    const rightOnUnverified = await attempt(email, PASSWORD)
    check('the right password reports the unconfirmed address',
      rightOnUnverified.error === 'EMAIL_NOT_VERIFIED',
      JSON.stringify(rightOnUnverified))

    console.log('a confirmed account')

    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })

    __resetRateLimits()
    const ok = await attempt(email, PASSWORD)
    check('the right password is admitted',
      (ok.user as { id?: string } | null)?.id === user.id, JSON.stringify(ok))

    const stillWrong = await attempt(email, WRONG)
    check('the wrong password is still refused',
      stillWrong.user === null && stillWrong.error === null, JSON.stringify(stillWrong))

    console.log('how the account may be named')

    __resetRateLimits()
    const byUpper = await attempt(email.toUpperCase(), PASSWORD)
    check('an address typed in capitals still matches',
      (byUpper.user as { id?: string } | null)?.id === user.id, JSON.stringify(byUpper))

    __resetRateLimits()
    const byUsername = await attempt(username, PASSWORD)
    check('the username works in place of the address',
      (byUsername.user as { id?: string } | null)?.id === user.id, JSON.stringify(byUsername))

    __resetRateLimits()
    const unknown = await attempt(`nobody-${process.pid}@example.invalid`, PASSWORD)
    check('an account that does not exist is refused',
      unknown.user === null && unknown.error === null, JSON.stringify(unknown))

    console.log('guessing')

    // Spent against one account from one source.
    __resetRateLimits()
    const limit = LIMITS.login.perAccountPerIp.limit
    for (let i = 0; i < limit; i++) await attempt(email, WRONG)
    const blocked = await attempt(email, WRONG)
    check(`refused after ${limit} attempts on one address`,
      blocked.error === 'RATE_LIMITED', JSON.stringify(blocked))

    // And the block is about the address, not the password: the right one is
    // refused too, or a limit would only slow down the wrong guesses.
    const blockedCorrect = await attempt(email, PASSWORD)
    check('the correct password is refused while the address is blocked',
      blockedCorrect.error === 'RATE_LIMITED', JSON.stringify(blockedCorrect))

    // The owner signing in from elsewhere is not locked out by those guesses.
    const elsewhere = await authorize({ email, password: PASSWORD }, { headers: { 'x-real-ip': '198.51.100.9' } })
      .then(() => null, (e: unknown) => (e instanceof Error ? e.message : String(e)))
    check('another source is not blocked by guesses from the first',
      elsewhere !== 'RATE_LIMITED', String(elsewhere))

    __resetRateLimits()
  } finally {
    // Leave the clone as found, for a repeatable run.
    await prisma.user.delete({ where: { id: user.id } })
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main()
