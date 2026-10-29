/**
 * How photos uploaded before rolls existed are grouped into them.
 *
 *   npx tsx scripts/test/rollBackfill.test.ts
 */
import { proposeRolls, SESSION_GAP_MS, type BackfillPhoto } from '../../src/lib/rollBackfill'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const t0 = Date.UTC(2026, 0, 1)
let n = 0
const photo = (seconds: number, cameraId: string | null, filmStockId: string | null, takenDate: string | null = null): BackfillPhoto =>
  ({ id: `p${++n}`, createdAt: new Date(t0 + seconds * 1000), cameraId, filmStockId, takenDate: takenDate ? new Date(takenDate) : null })
const shape = (photos: BackfillPhoto[]) => proposeRolls(photos).map(r => r.photos.map(p => p.id))

n = 0
check('one batch with one camera and film is one roll', shape([photo(0, 'c', 'f'), photo(3, 'c', 'f'), photo(6, 'c', 'f')]), [['p1', 'p2', 'p3']])

n = 0
check('a gap of exactly the threshold stays in the session', shape([photo(0, 'c', 'f'), photo(SESSION_GAP_MS / 1000, 'c', 'f')]), [['p1', 'p2']])

n = 0
check('a longer gap starts a new roll', shape([photo(0, 'c', 'f'), photo(3, 'c', 'f'), photo(SESSION_GAP_MS / 1000 + 4, 'c', 'f'), photo(SESSION_GAP_MS / 1000 + 6, 'c', 'f')]), [['p1', 'p2'], ['p3', 'p4']])

n = 0
check('a photo that would be a roll of one stays loose', shape([photo(0, 'c', 'f'), photo(3, 'c', 'f'), photo(5, 'c', 'f2')]), [['p1', 'p2']])

n = 0
check('interleaved tags within one batch make one roll per camera and film, not a roll per change',
  shape([photo(0, 'c', 'f1'), photo(2, 'c', 'f2'), photo(4, 'c', 'f1'), photo(6, 'c', 'f2')]), [['p1', 'p3'], ['p2', 'p4']])

n = 0
check('photos with no tags group together', shape([photo(0, null, null), photo(5, null, null)]), [['p1', 'p2']])

n = 0
check('upload order wins over the order given', shape([photo(20, 'c', 'f'), photo(0, 'c', 'f'), photo(10, 'c', 'f')]), [['p2', 'p3', 'p1']])

n = 0
const dated = proposeRolls([photo(0, 'c', 'f', '2025-06-03'), photo(5, 'c', 'f'), photo(9, 'c', 'f', '2025-05-30')])[0]
check('the shot range comes only from typed dates', [dated.shotFrom?.toISOString().slice(0, 10), dated.shotTo?.toISOString().slice(0, 10)], ['2025-05-30', '2025-06-03'])

n = 0
check('a roll with no typed dates has no shot range', proposeRolls([photo(0, 'c', 'f'), photo(4, 'c', 'f')])[0].shotFrom, null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
