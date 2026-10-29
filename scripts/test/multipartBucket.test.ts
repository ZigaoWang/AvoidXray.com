/**
 * Multipart uploads against the real bucket, as the import page makes them.
 *
 * The local stand-in (LOCAL_UPLOADS) proves the flow, not that the bucket
 * accepts it: that a part signed by the server can be PUT with nothing but
 * its URL, as a browser sends it, that an upload started private stays
 * private, that completing checks the parts, and that an aborted upload is
 * gone. Everything it stores is deleted at the end.
 *
 * Needs bucket credentials, so it is not part of `npm test` or CI:
 *
 *   ALLOW_OSS_TEST=1 npx tsx scripts/test/multipartBucket.test.ts
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'

if (process.env.ALLOW_OSS_TEST !== '1') {
  console.error('Writes to the real bucket: set ALLOW_OSS_TEST=1.')
  process.exit(1)
}
if (process.env.LOCAL_UPLOADS === '1') {
  console.error('LOCAL_UPLOADS is set, so nothing would reach the bucket. Unset it.')
  process.exit(1)
}

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.error(`  FAIL ${name} ${detail}`) }
}

async function main() {
  const { abortUpload, completeUpload, listParts, PART_SIZE, signParts, startUpload } = await import('../../src/lib/library/multipart')
  const { deleteFromOSS, publicObjectUrl, readFromOSS } = await import('../../src/lib/oss')
  const { newPhotoKey } = await import('../../src/lib/photoStorage')

  const key = newPhotoKey('original', 'tif')
  const abandoned = newPhotoKey('original', 'tif')
  const file = randomBytes(PART_SIZE + 1234)
  const put = async (url: string, body: Uint8Array) => (await fetch(url, { method: 'PUT', body: new Uint8Array(body) })).status

  try {
    const uploadId = await startUpload(key)
    const urls = await signParts(key, uploadId, [1, 2])
    check('part 1 is accepted from its signed URL alone', (await put(urls[1], file.subarray(0, PART_SIZE))) === 200)

    const early = await completeUpload(key, uploadId, { bytes: file.length, partSize: PART_SIZE })
    check('completing with a part missing names it and joins nothing', !early.ok && early.missing.join() === '2')

    check('part 2 is accepted', (await put(urls[2], file.subarray(PART_SIZE))) === 200)
    check('the bucket lists both parts', (await listParts(key, uploadId)).map(p => p.partNumber).join() === '1,2')
    const done = await completeUpload(key, uploadId, { bytes: file.length, partSize: PART_SIZE })
    check('the upload completes once every part is there', done.ok)

    const stored = await readFromOSS(key)
    check('the stored object is the file, byte for byte', stored.equals(file))
    const anonymous = (await fetch(publicObjectUrl(key), { method: 'HEAD' })).status
    check('it is private: an anonymous request is refused', anonymous === 403, String(anonymous))

    const tampered = await signParts(key, uploadId, [1])
    const reused = await put(tampered[1].replace(/Signature=[^&]+/, 'Signature=0'.padEnd(74, '0')), file.subarray(0, 10))
    check('a part URL with a wrong signature is refused', reused === 403, String(reused))

    const leftId = await startUpload(abandoned)
    const leftUrls = await signParts(abandoned, leftId, [1])
    await put(leftUrls[1], file.subarray(0, 1000))
    await abortUpload(abandoned, leftId)
    let gone = false
    try { await listParts(abandoned, leftId) } catch { gone = true }
    check('an aborted upload is gone with its parts', gone)
    await abortUpload(abandoned, leftId)
    check('aborting it again is harmless', true)
  } finally {
    await deleteFromOSS(key).catch(() => {})
    await deleteFromOSS(abandoned).catch(() => {})
  }
}

main()
  .catch(error => { fail++; console.error(error) })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
  })
