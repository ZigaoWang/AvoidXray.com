/**
 * The summary a description implies.
 *
 * Nothing stores this, so it runs unattended on everything people write. The
 * cases that matter are the ones where it must answer null rather than a
 * fragment: a wrong answer here is printed as the identifying sentence on the
 * page and in every link preview of it.
 *
 *   npx tsx scripts/test/catalogForm.test.ts
 */
import {
  SUMMARY_MAX,
  SUMMARY_MIN,
  summaryFromDescription,
  worthAdding,
  emptyDraft,
  resolvedFormat,
} from '../../src/lib/catalogForm'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

console.log('what a description implies')

// The Canon Autoboy S, as it was actually typed into the site: an identifying
// sentence, a newline, then the rest. It is the case this exists for.
const autoboy =
  'A 1993 Canon 35mm compact with a 38-115mm f/3.6-8.5 zoom, sold as Sure Shot Z115 and Prima Super 115.\r\n' +
  "It was the top of Canon's zoom compact line, with an aluminum front cover, two aspherical lens " +
  'elements and a 1/1200 sec. top shutter speed.'
check('the first line becomes the summary',
  summaryFromDescription(autoboy),
  'A 1993 Canon 35mm compact with a 38-115mm f/3.6-8.5 zoom, sold as Sure Shot Z115 and Prima Super 115.')

check('a blank line separator works the same way',
  summaryFromDescription('Kodak Gold 200 is a consumer color negative film.\n\nIt is warm and forgiving.'),
  'Kodak Gold 200 is a consumer color negative film.')

check('a single paragraph is its own summary',
  summaryFromDescription('An inexpensive color negative film sold everywhere, and forgiving of exposure.'),
  'An inexpensive color negative film sold everywhere, and forgiving of exposure.')

console.log('when there is nothing to take')

check('empty is null', summaryFromDescription(''), null)
check('whitespace is null', summaryFromDescription('   \n  '), null)
check('null in, null out', summaryFromDescription(null), null)
check('undefined in, null out', summaryFromDescription(undefined), null)
// The column refuses anything shorter, and a fragment is worse than a gap.
check('too short to be a summary is null', summaryFromDescription('A camera.'), null)
check(`exactly ${SUMMARY_MIN} characters is kept`,
  summaryFromDescription('A'.repeat(SUMMARY_MIN)), 'A'.repeat(SUMMARY_MIN))

console.log('a first line too long to be a summary')

const longLead =
  'This is a deliberately long opening sentence about a camera, written so that the whole line runs past ' +
  'the two hundred characters the summary column allows and cannot be used as it stands. And here is a ' +
  'second sentence that follows it.'
const fromLong = summaryFromDescription(longLead)
check('falls back to the first sentence',
  fromLong,
  'This is a deliberately long opening sentence about a camera, written so that the whole line runs past ' +
  'the two hundred characters the summary column allows and cannot be used as it stands.')

// No sentence break at all. Cutting it would leave a fragment, so there is no
// summary to be had from this and the column stays empty.
const noBreak = 'word '.repeat(80).trim()
check('an unbroken over-long line yields nothing', summaryFromDescription(noBreak), null)

// The real case that ruled out truncation: a long first line whose sentence
// also runs past the limit.
const runOn =
  'The Kodak ColorPlus 200 is an ultra-affordable, versatile color negative film (C-41 process) with an ' +
  "ISO 200 speed, serving as one of Kodak's most budget-friendly consumer-grade options alongside its " +
  'other stocks and remaining widely available today.'
check('a run-on first sentence yields nothing rather than a fragment',
  summaryFromDescription(runOn), null)

// An abbreviation must not be mistaken for the end of a sentence.
const abbrev =
  'A compact with a 1/1200 sec. top shutter speed and a great many other qualities worth describing at ' +
  'some length, which is what makes this particular opening line rather too long to use as it stands. ' +
  'Then a second sentence.'
check('an abbreviation does not end the sentence',
  summaryFromDescription(abbrev)?.endsWith('as it stands.'), true)

console.log('every answer fits the column')

for (const [name, text] of [
  ['autoboy', autoboy], ['long lead', longLead], ['no break', noBreak], ['abbrev', abbrev],
] as const) {
  const s = summaryFromDescription(text)
  const ok = s === null || (s.length >= SUMMARY_MIN && s.length <= SUMMARY_MAX)
  check(`${name} is null or within ${SUMMARY_MIN}-${SUMMARY_MAX}`, ok, true)
}

console.log('what is still worth adding')

check('an empty camera draft names the fields worth having',
  worthAdding('camera', emptyDraft()),
  ['a description', 'body type', 'format', 'year'])

check('a disposable is not asked for a year',
  worthAdding('camera', { ...emptyDraft(), bodyType: 'DISPOSABLE' }),
  ['a description', 'format'])

check('an empty film draft names its own',
  worthAdding('film', emptyDraft()),
  ['a description', 'ISO', 'format'])

check('a filled draft asks for nothing',
  worthAdding('film', {
    ...emptyDraft(),
    description: 'A fast black and white film.', iso: '400', format: '35mm',
  }),
  [])

// A stock sold in two gauges keeps both. The control was a single select over
// a list column, so editing the format at all dropped the other one.
check('two gauges are two gauges',
  resolvedFormat({ ...emptyDraft(), format: '35mm, 120' }),
  '35mm, 120')

check('a custom format counts as a format',
  worthAdding('camera', {
    ...emptyDraft(),
    description: 'x', bodyType: 'COMPACT', format: 'Other', customFormat: '127', year: '1990',
  }),
  [])

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
