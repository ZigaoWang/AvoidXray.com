/**
 * Which image optimizer failures leave the error log.
 *
 * Only a missing file (404, or 403 from the private bucket) for an old
 * address is moved to info. Everything else the optimizer reports is a real
 * problem and must still reach the error log.
 *
 *   npx tsx scripts/test/imageLog.test.ts
 */
import { missingImageLine } from '../../src/lib/imageLog'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const href = 'https://bucket.oss-cn-hongkong.aliyuncs.com/avatars/abc.webp'
const failed = 'upstream image response failed for'

console.log('moved to info')
check('404', missingImageLine(['⨯', failed, href, 404]), '[image] no file at avatars/abc.webp (404), an old address')
check('403', missingImageLine(['⨯', failed, href, 403]), '[image] no file at avatars/abc.webp (403), an old address')

console.log('left as errors')
check('a 500 from the bucket', missingImageLine(['⨯', failed, href, 500]), null)
check('a network error', missingImageLine(['⨯', failed, href, new Error('ECONNRESET')]), null)
check('a timeout', missingImageLine(['⨯', 'upstream image response timed out for', href]), null)
check('any other error', missingImageLine(['⨯', 'Error: something broke']), null)
check('an unparsable address', missingImageLine(['⨯', failed, 'not a url', 404]), null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
