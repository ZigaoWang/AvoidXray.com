/**
 * The vision worker's query scoring (vision/textSearch.ts), on small made-up
 * vectors: who can be returned, when a query is vague, the cutoff, and the
 * lowercasing that place names depended on.
 *
 *   npx tsx scripts/test/textSearch.test.ts
 */
import { MIN_MARGIN, MIN_LIFT, encodeQuery, normalize, scoreQuery, type PhotoIndex } from '../../vision/textSearch'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

/**
 * An index whose margins are set directly: each photo's vector is the unit
 * vector on axis 0 scaled by its margin plus a constant, and its baseline is
 * that constant, so margin(query = axis 0) is exactly the number given.
 */
function indexOf(margins: Record<string, number>, privateIds: string[] = []): PhotoIndex {
  const index: PhotoIndex = { vectors: new Map(), baselines: new Map(), searchable: new Set() }
  for (const [id, m] of Object.entries(margins)) {
    index.vectors.set(id, new Float32Array([m + 0.5, 0]))
    index.baselines.set(id, 0.5)
    if (!privateIds.includes(id)) index.searchable.add(id)
  }
  return index
}
const query = new Float32Array([1, 0])
const ids = (r: { results: { id: string }[] }) => r.results.map(x => x.id)

console.log('who can be returned')
// 100 typical photos below zero, three that match.
const spread = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`p${i}`, -0.02 + i * 0.0001]))
const index = indexOf({ ...spread, match: 0.08, privateMatch: 0.09, weak: 0.02 }, ['privateMatch'])
check('the site sees only searchable photos, best first', ids(scoreQuery(index, query)), ['match'])
check('a library search sees the owner\'s private photos', ids(scoreQuery(index, query, new Set(['privateMatch', 'match']))), ['privateMatch', 'match'])
check('and only the photos it names', ids(scoreQuery(index, query, new Set(['p1', 'privateMatch']))), ['privateMatch'])
check('an id the index does not hold is ignored', ids(scoreQuery(index, query, new Set(['nope']))), [])

console.log('vague queries')
const flat = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}`, 0.02 + (i % 10) * 0.001]))
const vague = scoreQuery(indexOf(flat), query)
check('lifting every photo alike is vague', vague.vague, true)
check('and returns nothing', vague.results.length, 0)

console.log('the cutoff')
// The typical photo above zero but the best ones well above it: not vague,
// and the bar is the median plus MIN_LIFT rather than MIN_MARGIN alone.
const lifted = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`l${i}`, 0.026 + (i % 5) * 0.0001]))
const strong = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, 0.09]))
const placeIndex = indexOf({ ...lifted, ...strong, b: 0.06, c: 0.03 })
const place = scoreQuery(placeIndex, query)
check('a place lifts the typical photo, and only the photos well above it match', ids(place), [...Object.keys(strong), 'b'])
check('its median clears MIN_MARGIN', place.median > MIN_MARGIN, true)
check('the bar is the median plus MIN_LIFT', 0.06 >= place.median + MIN_LIFT && 0.03 < place.median + MIN_LIFT, true)

async function lowercasing() {
  console.log('lowercasing')
  const seen: string[] = []
  await encodeQuery(async text => { seen.push(text); return normalize(new Float32Array([1, 0])) }, 'Big Ben')
  check('every phrasing is encoded in lowercase', seen.every(t => t.includes('big ben') && !/[A-Z]/.test(t)), true)
}

lowercasing().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})
