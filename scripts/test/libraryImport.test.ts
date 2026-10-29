/**
 * An import from registration to photo, against a real database.
 *
 * Runs the server side of the import page without the browser or the bucket:
 * files are registered, their parts stored and completed through the local
 * stand-in for the bucket (LOCAL_UPLOADS), and made into photos by the import
 * worker's own function. What is checked is what the import promises: a file
 * already in the library is not uploaded again, a file on its way is resumed,
 * the photo is private and follows its roll, its bytes are the bytes that
 * were sent, a near copy is flagged rather than dropped, the storage limit
 * holds, and an account cannot reach another's roll.
 *
 *   DATABASE_URL=<throwaway> ALLOW_DB_TEST=1 npx tsx scripts/test/libraryImport.test.ts
 */
import sharp from 'sharp'
import { PrismaClient } from '@prisma/client'

process.env.LOCAL_UPLOADS = '1'
process.env.NEXTAUTH_SECRET ||= 'library-import-test'

function databaseName(): string | null {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile('.env')
    } catch {
      // No .env; the URL has to come from the environment.
    }
  }
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)) || null
  } catch {
    return null
  }
}

const dbName = databaseName()
if (process.env.ALLOW_DB_TEST !== '1' && !/test|clone|trial/i.test(dbName ?? '')) {
  console.error(`Refusing to run against database "${dbName ?? '(unknown)'}". Point DATABASE_URL at a throwaway database or set ALLOW_DB_TEST=1.`)
  process.exit(1)
}

const prisma = new PrismaClient()
let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.error(`  FAIL ${name} ${detail}`) }
}

const PREFIX = 'libimport_'

async function scan(seed: number, quality = 92): Promise<Buffer> {
  const width = 900
  const height = 600
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      pixels[i] = (x * 255) / width
      pixels[i + 1] = ((y + seed * 37) * 255 / height) % 256
      pixels[i + 2] = (seed * 53) % 256
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .withExif({ IFD0: { Make: 'FUJI PHOTO FILM CO., LTD.', Model: 'SP-3000' } })
    .jpeg({ quality })
    .toBuffer()
}

async function main() {
  const { sha256Hex, imageDataSha256 } = await import('../../src/lib/imageHash')
  const { registerFiles } = await import('../../src/lib/library/importItems')
  const { completeUpload, storeLocalPart } = await import('../../src/lib/library/multipart')
  const { FinalImportError, processImportItem, publishPhotos } = await import('../../src/lib/library/processImportItem')
  const { deleteFromOSS } = await import('../../src/lib/oss')
  const { storedKeys } = await import('../../src/lib/photoStorage')

  const cleanup = async () => {
    const photos = await prisma.photo.findMany({
      where: { userId: { startsWith: PREFIX } },
      select: { originalKey: true, thumbKey: true, mediumKey: true, largeKey: true },
    })
    const items = await prisma.importItem.findMany({ where: { userId: { startsWith: PREFIX } }, select: { originalKey: true } })
    await Promise.all([...photos.flatMap(storedKeys), ...items.map(i => i.originalKey)].map(k => deleteFromOSS(k).catch(() => {})))
    await prisma.importItem.deleteMany({ where: { userId: { startsWith: PREFIX } } })
    await prisma.photo.deleteMany({ where: { userId: { startsWith: PREFIX } } })
    await prisma.roll.deleteMany({ where: { ownerId: { startsWith: PREFIX } } })
    await prisma.import.deleteMany({ where: { userId: { startsWith: PREFIX } } })
    await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
    await prisma.camera.deleteMany({ where: { id: { startsWith: PREFIX } } })
  }

  try {
    await cleanup()
    const user = await prisma.user.create({
      data: { id: `${PREFIX}owner`, email: `${PREFIX}owner@example.invalid`, username: `${PREFIX}owner`, passwordHash: 'x', isAdmin: true },
      select: { id: true, isAdmin: true, storageLimitBytes: true },
    })
    const small = await prisma.user.create({
      data: {
        id: `${PREFIX}small`, email: `${PREFIX}small@example.invalid`, username: `${PREFIX}small`, passwordHash: 'x',
        storageLimitBytes: BigInt(1000),
      },
      select: { id: true, isAdmin: true, storageLimitBytes: true },
    })
    const camera = await prisma.camera.create({ data: { id: `${PREFIX}camera`, name: 'Libimport FM2', slug: 'libimport-fm2' } })
    const roll = await prisma.roll.create({ data: { ownerId: user.id, cameraId: camera.id } })
    const strangersRoll = await prisma.roll.create({ data: { ownerId: small.id } })
    const imp = await prisma.import.create({ data: { userId: user.id } })

    const fileOf = async (bytes: Buffer, clientId: string, extra: Partial<{ rollId: string | null; rollPosition: number | null; filename: string }> = {}) => ({
      clientId,
      filename: extra.filename ?? `${clientId}.jpg`,
      folder: 'Roll 12',
      bytes: bytes.length,
      sha256: await sha256Hex(bytes),
      imageSha256: await imageDataSha256(bytes),
      rollId: extra.rollId === undefined ? roll.id : extra.rollId,
      rollPosition: extra.rollPosition === undefined ? 1 : extra.rollPosition,
    })

    /** Sends a registered file's bytes and completes it, as the page would. */
    const upload = async (itemId: string, bytes: Buffer) => {
      const item = await prisma.importItem.findUniqueOrThrow({ where: { id: itemId } })
      for (let n = 1, offset = 0; offset < bytes.length; n++, offset += item.partSize) {
        await storeLocalPart(item.multipartUploadId!, n, bytes.subarray(offset, offset + item.partSize))
      }
      const done = await completeUpload(item.originalKey, item.multipartUploadId!, { bytes: item.bytes, partSize: item.partSize })
      if (done.ok) await prisma.importItem.update({ where: { id: itemId }, data: { state: 'UPLOADED', multipartUploadId: null } })
      return done
    }

    console.log('registering')
    const first = await scan(1)
    const [registered] = await registerFiles(user, imp.id, [await fileOf(first, 'a')])
    check('a new file is to be uploaded', registered.outcome === 'upload', JSON.stringify(registered))
    if (registered.outcome !== 'upload') throw new Error('cannot go on')

    const [again] = await registerFiles(user, imp.id, [await fileOf(first, 'a-again')])
    check('the same file dropped again while uploading resumes the same item',
      again.outcome === 'upload' && again.itemId === registered.itemId)

    const [stranger] = await registerFiles(user, imp.id, [await fileOf(await scan(9), 'x', { rollId: strangersRoll.id })])
    check('another account\'s roll is refused', stranger.outcome === 'refused', JSON.stringify(stranger))

    const [notImage] = await registerFiles(user, imp.id, [{ ...(await fileOf(first, 'doc')), filename: 'notes.pdf' }])
    check('a file of another type is refused with a reason', notImage.outcome === 'refused' && /JPEG/.test(notImage.reason))

    const smallImport = await prisma.import.create({ data: { userId: small.id } })
    const [overLimit] = await registerFiles(small, smallImport.id, [await fileOf(first, 'big', { rollId: null })])
    check('a file over the storage limit is refused', overLimit.outcome === 'refused' && /storage limit/.test(overLimit.reason))

    console.log('uploading')
    const halfway = await prisma.importItem.findUniqueOrThrow({ where: { id: registered.itemId } })
    const early = await completeUpload(halfway.originalKey, halfway.multipartUploadId!, { bytes: halfway.bytes, partSize: halfway.partSize })
    check('completing before the parts are stored lists what is missing', !early.ok && early.missing.join() === '1')
    check('the stored parts complete the upload', (await upload(registered.itemId, first)).ok)

    console.log('making the photo')
    const photoId = await processImportItem(registered.itemId)
    const photo = await prisma.photo.findUniqueOrThrow({
      where: { id: photoId },
      select: {
        visibility: true, imagesPublic: true, uploadComplete: true, rollId: true, rollPosition: true, cameraId: true,
        originalKey: true, originalFilename: true, scannerModel: true, originalSha256: true, thumbnailPath: true,
      },
    })
    const item = await prisma.importItem.findUniqueOrThrow({ where: { id: registered.itemId } })
    check('the photo is private, its files too', photo.visibility === 'PRIVATE' && !photo.imagesPublic)
    check('the photo is complete and listed in the library', photo.uploadComplete)
    check('the photo is in its roll and takes the roll\'s camera', photo.rollId === roll.id && photo.rollPosition === 1 && photo.cameraId === camera.id)
    check('the original is the uploaded file, where the browser put it',
      photo.originalKey === item.originalKey && photo.originalSha256 === await sha256Hex(first))
    check('the file name and scanner are kept', photo.originalFilename === 'a.jpg' && photo.scannerModel === 'SP-3000')
    check('the thumbnail is served through the owner\'s image route', photo.thumbnailPath.startsWith(`/api/photos/${photoId}/image/thumb`))
    check('the item is done and names its photo', item.state === 'DONE' && item.photoId === photoId)

    const [duplicate] = await registerFiles(user, imp.id, [await fileOf(first, 'dup')])
    check('the same file is now skipped as already in the library',
      duplicate.outcome === 'duplicate' && duplicate.photoId === photoId, JSON.stringify(duplicate))

    console.log('a near copy')
    const rescan = await scan(1, 70)
    const [near] = await registerFiles(user, imp.id, [await fileOf(rescan, 'near', { rollPosition: 2 })])
    if (near.outcome !== 'upload') throw new Error(`near copy: ${JSON.stringify(near)}`)
    await upload(near.itemId, rescan)
    await processImportItem(near.itemId)
    const nearItem = await prisma.importItem.findUniqueOrThrow({ where: { id: near.itemId } })
    check('a re-encoded copy is made into a photo and flagged, not dropped',
      nearItem.state === 'DONE' && nearItem.lookalikeOfId === photoId)

    console.log('a file that is not what was sent')
    const claimed = await scan(3)
    const [swapped] = await registerFiles(user, imp.id, [await fileOf(claimed, 'swap', { rollPosition: 3 })])
    if (swapped.outcome !== 'upload') throw new Error('swap')
    const other = await scan(4)
    const padded = Buffer.concat([other, Buffer.alloc(Math.max(0, claimed.length - other.length))]).subarray(0, claimed.length)
    await upload(swapped.itemId, padded)
    let refused = false
    try { await processImportItem(swapped.itemId) } catch (error) { refused = error instanceof FinalImportError }
    check('bytes that do not match the registered hash are refused for good', refused)

    console.log('publishing')
    await publishPhotos(user.id, [photoId])
    const published = await prisma.photo.findUniqueOrThrow({ where: { id: photoId }, select: { visibility: true, imagesPublic: true, thumbnailPath: true } })
    check('a published photo is public with readable files', published.visibility === 'PUBLIC' && published.imagesPublic && !published.thumbnailPath.startsWith('/api/'))
  } finally {
    await cleanup().catch(error => console.error('cleanup failed:', error))
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
