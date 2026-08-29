/**
 * Guards the reference code, which is doing two jobs at once.
 *
 * It is the label a reporter reads back over a phone, and — because a
 * signed-out reporter has no account to authenticate against — it is also the
 * capability that opens their status page. That second job is why the
 * alphabet, the length and the normalising all matter: a code that is easy to
 * mistype is a support problem, and a code that is easy to guess is a
 * disclosure one.
 *
 *   npx tsx scripts/test/feedback.test.ts
 */
import {
  generateFeedbackReference,
  normalizeFeedbackReference,
  isFeedbackKind,
  isFeedbackStatus,
  looksLikeEmail,
  feedbackStatus,
  FEEDBACK_STATUSES,
} from '../../src/lib/feedback'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

console.log('reference generation')

const sample = Array.from({ length: 2000 }, generateFeedbackReference)

check('shaped AX- plus ten characters', /^AX-[0-9A-Z]{10}$/.test(sample[0]), true)

// Crockford's alphabet minus I, L, O and U. The first three are the ones people
// mistype; dropping U is what stops a random code spelling something rude.
const forbidden = sample.filter((r) => /[ILOU]/.test(r.slice(3)))
check('never contains I, L, O or U', forbidden.length, 0)

// Fifty bits. Any collision in two thousand draws would mean the generator is
// not doing what the status page's security rests on.
check('no collisions across 2000 draws', new Set(sample).size, 2000)

// A stuck generator would still pass the shape check above.
const positions = new Set(sample.map((r) => r[3]))
check('varies the first character', positions.size > 8, true)

console.log('reference normalising')

// The forms a person actually types: off a screenshot, in lower case, with the
// prefix dropped, or with hyphens they added themselves.
const canonical = 'AX-7QK4M2XTB9'
check('accepts the canonical form', normalizeFeedbackReference('AX-7QK4M2XTB9'), canonical)
check('accepts lower case', normalizeFeedbackReference('ax-7qk4m2xtb9'), canonical)
check('accepts a missing prefix', normalizeFeedbackReference('7QK4M2XTB9'), canonical)
check('accepts surrounding space', normalizeFeedbackReference('  AX-7QK4M2XTB9  '), canonical)
check('accepts stray hyphens', normalizeFeedbackReference('AX-7QK4-M2XT-B9'), canonical)

check('rejects the wrong length', normalizeFeedbackReference('AX-7QK4'), null)
check('rejects one character too many', normalizeFeedbackReference('AX-7QK4M2XTB99'), null)
check('rejects characters outside the alphabet', normalizeFeedbackReference('AX-7QK4M2XTBI'), null)
check('rejects empty input', normalizeFeedbackReference(''), null)
// The lookup page sits at /report/lookup beside /report/[reference]; this is
// what guarantees the two can never mean the same thing.
check('rejects the lookup path segment', normalizeFeedbackReference('lookup'), null)

// Anything generated must survive a round trip through the parser.
const roundTripped = sample.slice(0, 200).every((r) => normalizeFeedbackReference(r) === r)
check('every generated reference normalises to itself', roundTripped, true)

console.log('validation')

check('known kind accepted', isFeedbackKind('BUG'), true)
check('unknown kind rejected', isFeedbackKind('URGENT'), false)
check('non-string kind rejected', isFeedbackKind(null), false)
check('known status accepted', isFeedbackStatus('FIXED'), true)
// The admin queue relies on this: ALL is a view, not a status.
check('ALL is not a status', isFeedbackStatus('ALL'), false)

check('ordinary address accepted', looksLikeEmail('a@b.co'), true)
check('address without a dot rejected', looksLikeEmail('a@b'), false)
check('address without an at rejected', looksLikeEmail('ab.co'), false)
check('address with a space rejected', looksLikeEmail('a b@c.co'), false)

console.log('status copy')

// Every status the database can hold must have words for the reporter, or the
// status page renders a blank explanation.
const covered = FEEDBACK_STATUSES.every(
  (s) => feedbackStatus(s.value).label.length > 0 && feedbackStatus(s.value).blurb.length > 0
)
check('every status has a label and a blurb', covered, true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
