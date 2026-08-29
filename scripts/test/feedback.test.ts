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
  feedbackStatusBlurb,
  FEEDBACK_STATUSES,
  FEEDBACK_KINDS,
  feedbackKindPlaceholder,
  awaitingStaffReply,
  nudgeAvailableAt,
  waitDescription,
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
// The lookup page sits at /feedback/lookup beside /feedback/[reference]; this is
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

console.log('kind copy')

// Every kind needs its own prompt. A missing one silently falls back to the
// bug wording, which is the thing this replaced.
check(
  'every kind has a placeholder',
  FEEDBACK_KINDS.every((k) => feedbackKindPlaceholder(k.value).length > 0),
  true
)
check(
  'no two kinds share a placeholder',
  new Set(FEEDBACK_KINDS.map((k) => k.placeholder)).size,
  FEEDBACK_KINDS.length
)
check(
  'an unknown kind still yields a prompt',
  feedbackKindPlaceholder('NOPE').length > 0,
  true
)

console.log('reminders')

const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms)

// Waiting on us: nothing answered, or their word was the last one.
check('a thread with no replies is waiting', awaitingStaffReply([]), true)
check(
  'a thread whose last word is theirs is waiting',
  awaitingStaffReply([{ author: 'STAFF' }, { author: 'SENDER' }]),
  true
)
// Not waiting: we answered last, so a reminder would just be noise.
check(
  'a thread we answered last is not waiting',
  awaitingStaffReply([{ author: 'SENDER' }, { author: 'STAFF' }]),
  false
)

// The cooldown runs from the last activity, so a message cannot be chased the
// moment it is sent.
check('cannot chase something just sent', nudgeAvailableAt(ago(0), null) !== null, true)
check('cannot chase after an hour', nudgeAvailableAt(ago(HOUR), null) !== null, true)
check('can chase after a day', nudgeAvailableAt(ago(25 * HOUR), null), null)

// And from the last reminder, so it cannot be sent twice in a day even on an
// old thread.
check(
  'a recent reminder blocks another',
  nudgeAvailableAt(ago(90 * HOUR), ago(HOUR)) !== null,
  true
)
check('a day-old reminder does not', nudgeAvailableAt(ago(90 * HOUR), ago(25 * HOUR)), null)

// The later of the two wins, whichever way round they fall.
check(
  'the later timestamp governs',
  nudgeAvailableAt(ago(HOUR), ago(90 * HOUR)) !== null,
  true
)

const now = new Date()
check('wait under an hour reads as an hour', waitDescription(new Date(now.getTime() + 10 * 60 * 1000), now), 'in an hour')
check('wait of hours reads in hours', waitDescription(new Date(now.getTime() + 5 * HOUR), now), 'in 5 hours')
check('wait of 20 hours still reads in hours', waitDescription(new Date(now.getTime() + 20 * HOUR), now), 'in 20 hours')
// Reachable: the cooldown is a full day, so a message chased immediately after
// sending is told to come back tomorrow.
check('a full day reads as tomorrow', waitDescription(new Date(now.getTime() + 24 * HOUR), now), 'tomorrow')

console.log('status copy')

// Every status the database can hold must have words for the sender, or the
// status page renders a blank explanation.
const covered = FEEDBACK_STATUSES.every(
  (s) => feedbackStatus(s.value).label.length > 0 && feedbackStatus(s.value).blurb.length > 0
)
check('every status has a label and a blurb', covered, true)

// The page used to head an answered thread "Received and not yet reviewed",
// directly above the reply, so it contradicted itself.
check(
  'unanswered OPEN still says it has not been reviewed',
  feedbackStatusBlurb('OPEN', false),
  'Received and not yet reviewed.'
)
check('answered OPEN does not claim otherwise', feedbackStatusBlurb('OPEN', true), 'Answered below.')

// Only OPEN is ambiguous. The rest already state an outcome, and a reply does
// not change what that outcome is.
for (const status of FEEDBACK_STATUSES.filter((s) => s.value !== 'OPEN')) {
  check(
    `${status.value} reads the same either way`,
    feedbackStatusBlurb(status.value, true),
    feedbackStatusBlurb(status.value, false)
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
