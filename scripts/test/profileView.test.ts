/**
 * The profile's tab, sort and filter live in the URL. Both the server page and
 * the client component read that URL, so the parser is the contract between
 * them — and it takes whatever a shared or hand-edited link contains.
 *
 *   npx tsx scripts/test/profileView.test.ts
 */
import { parseProfileView, profileViewToQuery, isFilteredView, DEFAULT_PROFILE_VIEW } from '../../src/lib/profileView'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const q = (s: string) => new URLSearchParams(s)

console.log('profile view')

check('empty URL is the default view', parseProfileView(q('')), DEFAULT_PROFILE_VIEW)
check('tab and sort are read', parseProfileView(q('tab=stats&sort=recent')),
  { ...DEFAULT_PROFILE_VIEW, tab: 'stats', sort: 'recent' })
check('unknown tab falls back rather than erroring', parseProfileView(q('tab=nonsense')).tab, 'photos')
check('unknown sort falls back', parseProfileView(q('sort=nonsense')).sort, 'featured')

check('camera filter', parseProfileView(q('camera=cam1')).cameraId, 'cam1')
check('film filter', parseProfileView(q('film=f1')).filmStockId, 'f1')
check('day filter', parseProfileView(q('day=2026-02-15')).day, '2026-02-15')
check('malformed day is ignored', parseProfileView(q('day=yesterday')).day, null)

// A hand-written URL can carry several; the page must not be ambiguous.
check('day wins over camera and film', parseProfileView(q('day=2026-01-01&camera=c&film=f')),
  { tab: 'photos', sort: 'featured', cameraId: null, filmStockId: null, day: '2026-01-01' })
check('camera wins over film', parseProfileView(q('camera=c&film=f')),
  { tab: 'photos', sort: 'featured', cameraId: 'c', filmStockId: null, day: null })

// Round trips, and defaults stay out of the URL so a plain profile has none.
check('default view produces no query', profileViewToQuery(DEFAULT_PROFILE_VIEW), '')
check('filter round trips', parseProfileView(q(profileViewToQuery(
  { ...DEFAULT_PROFILE_VIEW, tab: 'stats', sort: 'recent', cameraId: 'cam1' }).slice(1))),
  { tab: 'stats', sort: 'recent', cameraId: 'cam1', filmStockId: null, day: null })
check('day round trips', profileViewToQuery({ ...DEFAULT_PROFILE_VIEW, day: '2026-02-15' }), '?day=2026-02-15')

check('unfiltered', isFilteredView(DEFAULT_PROFILE_VIEW), false)
check('filtered by day', isFilteredView({ ...DEFAULT_PROFILE_VIEW, day: '2026-01-01' }), true)

// Next hands query values through as string | string[] | undefined.
check('array param takes the first value', parseProfileView({ camera: ['a', 'b'] }).cameraId, 'a')
check('undefined param', parseProfileView({ camera: undefined }).cameraId, null)

console.log(`\n  ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
