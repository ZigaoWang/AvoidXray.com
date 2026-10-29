/**
 * A photo's private files cannot be read by address, and its public ones can.
 *
 * Runs against the real bucket, because what is being checked is the bucket's
 * own answer to an anonymous request: it stores one small generated photo
 * through the upload pipeline, then makes it private and public again,
 * fetching every file without credentials at each step. Everything it stores
 * is deleted at the end; the keys are random, so nothing it leaves behind
 * after a crash is referenced, and the orphan sweep collects it.
 *
 * Needs a throwaway database for the photo row, and bucket credentials, so it
 * is not part of `npm test` or CI. Run it before changing anything about how
 * photo files are stored or served:
 *
 *   DATABASE_URL=<throwaway> ALLOW_DB_TEST=1 ALLOW_OSS_TEST=1 npx tsx scripts/test/privateStorage.test.ts
 */
import 'dotenv/config'
import sharp from 'sharp'

if (process.env.ALLOW_OSS_TEST !== '1' || process.env.ALLOW_DB_TEST !== '1') {
  console.error('Writes to the real bucket and a database: set ALLOW_OSS_TEST=1 and ALLOW_DB_TEST=1, with DATABASE_URL on a throwaway database.')
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

const PREFIX = 'privstore_'

async function main() {
  const { prisma } = await import('../../src/lib/db')
  const { identifyOriginal, processImage } = await import('../../src/lib/image')
  const { publicObjectUrl, signedObjectUrl, deleteFromOSS } = await import('../../src/lib/oss')
  const { syncPhotoStorage, storedKeys } = await import('../../src/lib/photoStorage')

  /** A signed address is for GET, and the method is part of the signature, so one byte of it. */
  const readSigned = async (key: string) => (await fetch(await signedObjectUrl(key), { headers: { Range: 'bytes=0-0' } })).status
  /** Status of an anonymous request for each key. */
  const anonymous = (keys: string[]) => Promise.all(keys.map(async key => (await fetch(publicObjectUrl(key), { method: 'HEAD' })).status))
  const readKeys = () => prisma.photo.findUniqueOrThrow({
    where: { id: `${PREFIX}photo` },
    select: { originalKey: true, thumbKey: true, mediumKey: true, largeKey: true, imagesPublic: true, thumbnailPath: true },
  })

  const made = new Set<string>()
  try {
    await prisma.photo.deleteMany({ where: { id: { startsWith: PREFIX } } })
    await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
    await prisma.user.create({ data: { id: `${PREFIX}user`, email: `${PREFIX}user@example.invalid`, username: `${PREFIX}user`, passwordHash: 'x' } })

    const file = await sharp({ create: { width: 640, height: 427, channels: 3, background: { r: 90, g: 120, b: 150 } } }).jpeg().toBuffer()
    const processed = await processImage(file, await identifyOriginal(file), `${PREFIX}photo`, { imagesPublic: true })
    processed.keys.forEach(key => made.add(key))
    await prisma.photo.create({ data: { id: `${PREFIX}photo`, userId: `${PREFIX}user`, uploadComplete: true, ...processed.data } })

    console.log('a new public photo')
    let keys = await readKeys()
    const [original, ...display] = await anonymous(storedKeys(keys))
    check('its original answers 403 by address', original === 403, String(original))
    check('its display versions are readable by address', display.every(s => s === 200), JSON.stringify(display))
    check('a signed address reads the original', (await readSigned(keys.originalKey!)) === 206)
    const publicKeys = [keys.thumbKey, keys.mediumKey, keys.largeKey!]

    console.log('made private')
    await prisma.photo.update({ where: { id: `${PREFIX}photo` }, data: { visibility: 'PRIVATE' } })
    check('the move reports it was made private', (await syncPhotoStorage(`${PREFIX}photo`)) === 'made-private')
    keys = await readKeys()
    storedKeys(keys).forEach(key => made.add(key))
    const privateKeys = [keys.thumbKey, keys.mediumKey, keys.largeKey!]
    check('every display version moved to a new key', privateKeys.every(k => !publicKeys.includes(k)))
    check('the row says its files are private and points pages at the image route',
      !keys.imagesPublic && keys.thumbnailPath.startsWith(`/api/photos/${PREFIX}photo/image/thumb`))
    const moved = await anonymous(privateKeys)
    check('its display versions answer 403 by address', moved.every(s => s === 403), JSON.stringify(moved))
    const old = await anonymous(publicKeys)
    check('the old public addresses no longer serve anything', old.every(s => s === 404 || s === 403), JSON.stringify(old))
    const signed = await Promise.all(privateKeys.map(readSigned))
    check('a signed address reads each private version', signed.every(s => s === 206), JSON.stringify(signed))
    check('a second sync changes nothing', (await syncPhotoStorage(`${PREFIX}photo`)) === 'unchanged')

    console.log('published again')
    await prisma.photo.update({ where: { id: `${PREFIX}photo` }, data: { visibility: 'PUBLIC' } })
    check('the move reports it was made public', (await syncPhotoStorage(`${PREFIX}photo`)) === 'made-public')
    keys = await readKeys()
    const reopened = await anonymous([keys.thumbKey, keys.mediumKey, keys.largeKey!])
    check('its display versions are readable by address again', reopened.every(s => s === 200), JSON.stringify(reopened))
    check('its original still answers 403', (await anonymous([keys.originalKey!]))[0] === 403)
  } finally {
    await prisma.photo.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
    await Promise.all([...made].map(key => deleteFromOSS(key).catch(() => {})))
    await prisma.$disconnect()
  }
}

main()
  .catch(error => {
    fail++
    console.error(error)
  })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
  })
