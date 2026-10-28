/**
 * Checks on a downloaded archive master.
 *
 * LOC sits behind a CDN that answers some clients with an HTML challenge page.
 * Saved without looking, that page would be hashed and recorded as the
 * master. Only a TIFF exactly as long as the HEAD request said may pass.
 *
 *   npx tsx scripts/test/archiveMaster.test.ts
 */
import { masterContentTypeProblem, masterSizeProblem } from '../../src/lib/archive/master'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

console.log('content type')
check('a TIFF passes', masterContentTypeProblem('image/tiff'), null)
check('parameters and case do not matter', masterContentTypeProblem('Image/TIFF; charset=binary'), null)
check('a challenge page fails', masterContentTypeProblem('text/html; charset=UTF-8'), 'not a TIFF: content type text/html')
check('a JPEG fails', masterContentTypeProblem('image/jpeg'), 'not a TIFF: content type image/jpeg')
check('no content type fails', masterContentTypeProblem(null), 'not a TIFF: content type missing')
check('an empty content type fails', masterContentTypeProblem(''), 'not a TIFF: content type missing')

console.log('size')
check('the HEAD length passes', masterSizeProblem(46442328, 46442328), null)
check('a short file fails', masterSizeProblem(5852, 46442328), 'downloaded 5852 bytes, HEAD reported 46442328')
check('a longer file fails', masterSizeProblem(46442329, 46442328), 'downloaded 46442329 bytes, HEAD reported 46442328')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
