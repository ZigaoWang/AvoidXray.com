/**
 * Who sees features that are still being built.
 *
 *   npx tsx scripts/test/features.test.ts
 */
import { hasFeature } from '../../src/lib/features'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

check('the library is on for an admin', hasFeature({ isAdmin: true }, 'library'), true)
check('the library is off for everyone else', hasFeature({ isAdmin: false }, 'library'), false)
check('the library is off when signed out', [hasFeature(null, 'library'), hasFeature(undefined, 'library')], [false, false])

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
