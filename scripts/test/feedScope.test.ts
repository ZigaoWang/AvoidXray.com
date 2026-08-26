/**
 * Guards the two ways a feed gets narrowed against drifting apart.
 *
 * The random tab orders by a seeded md5 and so cannot go through Prisma; it
 * builds its WHERE clause as raw SQL while every other tab uses `feedWhere`.
 * They drifted: the raw side quietly ignored `day` and `albumId`, so filtering
 * a profile by date showed the correct count above a completely unfiltered
 * grid. Nothing failed — it just returned the wrong photos.
 *
 *   npx tsx scripts/test/feedScope.test.ts
 */
import { Prisma } from '@prisma/client'
import { feedScopeSql, feedWhere, parseFeedScope, type FeedScope } from '../../src/lib/photoFeed'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

/** One representative value per scope key, so every key is exercised. */
const SAMPLE: Required<FeedScope> = {
  filmStockId: 'film_1',
  cameraId: 'cam_1',
  username: 'zigaowang',
  albumId: 'album_1',
  day: '2026-01-04',
}

const keys = Object.keys(SAMPLE) as (keyof FeedScope)[]

console.log('feed scope')

// The bug in one assertion: a key the raw builder does not understand emits
// nothing, and the filter silently does not apply.
for (const key of keys) {
  const sql = feedScopeSql({ [key]: SAMPLE[key] } as FeedScope)
  check(`${key} produces a SQL clause`, sql.strings.join('').trim().length > 0, true)
}

// And the same key must actually narrow the Prisma side too, so the count
// beside the grid and the grid itself cannot disagree.
for (const key of keys) {
  const where = feedWhere('random', [], { [key]: SAMPLE[key] } as FeedScope)
  const narrowed =
    key === 'day' ? 'createdAt' in where
    : key === 'albumId' ? 'collections' in where
    : key === 'username' ? 'user' in where
    : key in where
  check(`${key} narrows feedWhere`, narrowed, true)
}

check('empty scope emits no SQL', feedScopeSql({}).strings.join('').trim(), '')

// Every key at once must still be a single valid conjunction.
const all = feedScopeSql(SAMPLE)
check('all keys combine', all.strings.join('').includes('AND'), true)
check('all keys bind their values', all.values.length >= keys.length, true)

// A malformed day must exclude everything rather than fall through to no
// filter at all — the failure that would look exactly like the original bug.
const badDay = feedScopeSql({ day: 'not-a-date' })
check('unparseable day excludes everything', badDay.strings.join('').includes('false'), true)

// parseFeedScope has to recognise every key, or the scope never reaches either
// builder in the first place.
const params = new URLSearchParams(Object.entries(SAMPLE).map(([k, v]) => [k, v]))
check('parseFeedScope reads every key', parseFeedScope(params), SAMPLE)

// Values are parameterised rather than interpolated.
const injected = feedScopeSql({ username: "'; DROP TABLE \"Photo\"; --" })
check('values are bound, not inlined', injected.strings.join('').includes('DROP TABLE'), false)
check('injection arrives as a parameter', injected.values[0], "'; DROP TABLE \"Photo\"; --")

void Prisma

console.log(`\n  ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
