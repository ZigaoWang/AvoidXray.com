/**
 * Guards the redirect target taken from `?callbackUrl=`.
 *
 * The previous check was `startsWith('/') && !startsWith('//')`, which reads
 * as though it only admits paths. It does not: the URL parser treats a
 * backslash as a slash for http(s), so "/\evil.com" satisfies both halves and
 * resolves to https://evil.com/. That is an open redirect fired the instant
 * after someone types their password into the genuine sign-in page, which is
 * the most persuasive possible moment to hand them to a copy of it.
 *
 * Pure string handling, so no database and no browser is needed. The cases
 * below are the ones that actually get tried.
 *
 *   npx tsx scripts/test/sameOriginPath.test.ts
 */
import { sameOriginPath } from '../../src/lib/validation'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

console.log('paths that are honoured')
check('a plain path', sameOriginPath('/photos/abc'), '/photos/abc')
check('query is kept', sameOriginPath('/explore?tab=recent'), '/explore?tab=recent')
check('fragment is kept', sameOriginPath('/films/hp5#notes'), '/films/hp5#notes')
check('a path that merely contains a host', sameOriginPath('/go/evil.com'), '/go/evil.com')

console.log('everything that points off-site')
check('protocol-relative', sameOriginPath('//evil.com'), null)
check('backslash, the one that got through', sameOriginPath('/\\evil.com'), null)
check('backslash then slash', sameOriginPath('/\\/evil.com'), null)
check('absolute url', sameOriginPath('https://evil.com'), null)
check('scheme with no slashes', sameOriginPath('javascript:alert(1)'), null)
check('a bare word', sameOriginPath('evil.com'), null)

console.log('nothing at all')
check('empty', sameOriginPath(''), null)
check('null', sameOriginPath(null), null)
check('undefined', sameOriginPath(undefined), null)
check('not a string', sameOriginPath(42), null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
