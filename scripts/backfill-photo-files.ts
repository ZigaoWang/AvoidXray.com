/**
 * Remakes every community photo's display versions from its original, and
 * records what the library needs to know about the file.
 *
 * For each photo not yet done:
 * - thumb, medium and the new 4000px large, each made straight from the
 *   original with sRGB embedded (src/lib/image.ts makeDerivatives), stored
 *   under new random keys with the photo's current access;
 * - the row pointed at them, with the stored original's sha256, its image data
 *   hash, a perceptual hash of the new thumb, its format, the scanner named in
 *   its metadata, and the size of the display versions.
 *
 * The old display versions are left in place. Nothing references them once the
 * row moves, and the orphan sweep (/api/admin/oss-sync) removes unreferenced
 * objects an hour old, which also covers a page rendered just before the move.
 *
 * Reads each original once: from the bucket mirror when it holds the file,
 * from the bucket otherwise. One photo at a time, with one libvips thread and
 * no operation cache, because it shares the machine with the site. Run it the
 * way the archive import is run (docs/images.md), after that import is done.
 *
 * Writes nothing unless --yes is given. Without it, it reports what is left to
 * do, and with --sample N times N photos end to end without uploading.
 *
 *   npx tsx scripts/backfill-photo-files.ts --sample 5
 *   npx tsx scripts/backfill-photo-files.ts --yes [--limit 100]
 */
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { Prisma, PrismaClient } from '@prisma/client'
import { identifyOriginal, makeDerivatives, scannerModelOf } from '../src/lib/image'
import { imageDataSha256, sha256Hex } from '../src/lib/imageHash'
import { readFromOSS, uploadToOSS, deleteFromOSS } from '../src/lib/oss'
import { newPhotoKey, storedPaths } from '../src/lib/photoStorage'

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/var/lib/avoidxray/media'

function parseArgs(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? Number(argv[i + 1]) : undefined
  }
  return { write: argv.includes('--yes'), limit: value('--limit'), sample: value('--sample') ?? 0 }
}

const prisma = new PrismaClient()

/** Not done: no large version yet, or no hash of the original. */
const TODO: Prisma.PhotoWhereInput = { kind: 'COMMUNITY', OR: [{ largeKey: null }, { originalSha256: null }] }

async function readOriginal(key: string): Promise<{ bytes: Buffer; from: 'mirror' | 'bucket' }> {
  const local = path.resolve(MEDIA_ROOT, key)
  if (local.startsWith(path.resolve(MEDIA_ROOT) + path.sep)) {
    try {
      return { bytes: await readFile(local), from: 'mirror' }
    } catch {
      // Not mirrored; fall through to the bucket.
    }
  }
  return { bytes: await readFromOSS(key), from: 'bucket' }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  sharp.concurrency(1)
  sharp.cache(false)

  const [left, bytes] = await Promise.all([
    prisma.photo.count({ where: TODO }),
    prisma.photo.aggregate({ where: TODO, _sum: { originalBytes: true } }),
  ])
  console.log(`${left} photos to do, ${((bytes._sum?.originalBytes ?? 0) / 1e9).toFixed(2)} GB of originals to read`)

  const photos = await prisma.photo.findMany({
    where: TODO,
    orderBy: { createdAt: 'asc' },
    take: args.write ? args.limit : args.sample,
    select: {
      id: true, imagesPublic: true, originalKey: true, thumbKey: true, mediumKey: true, largeKey: true,
    },
  })

  let done = 0
  let failed = 0
  const started = Date.now()
  for (const photo of photos) {
    const t0 = Date.now()
    try {
      if (!photo.originalKey) throw new Error('no original key')
      const { bytes: original, from } = await readOriginal(photo.originalKey)
      const read = Date.now() - t0
      const identified = await identifyOriginal(original)
      const derivatives = await makeDerivatives(identified.source)
      const [originalSha256, imageSha256, scannerModel] = await Promise.all([
        sha256Hex(original), imageDataSha256(original), scannerModelOf(original),
      ])
      const made = Date.now() - t0 - read

      if (!args.write) {
        console.log(`  ${photo.id}: ${(original.length / 1e6).toFixed(1)}MB from the ${from} in ${read}ms, versions in ${made}ms`
          + ` (large ${(derivatives.large.length / 1e6).toFixed(2)}MB${imageSha256 ? '' : ', no image data hash'})`)
        done++
        continue
      }

      const keys = {
        id: photo.id,
        originalKey: photo.originalKey,
        thumbKey: newPhotoKey('thumb', 'webp'),
        mediumKey: newPhotoKey('medium', 'webp'),
        largeKey: newPhotoKey('large', 'jpg'),
      }
      const access = photo.imagesPublic ? 'public' : 'private'
      const written: string[] = []
      try {
        for (const [key, buffer] of [
          [keys.thumbKey, derivatives.thumb], [keys.mediumKey, derivatives.medium], [keys.largeKey, derivatives.large],
        ] as const) {
          await uploadToOSS(buffer, key, access)
          written.push(key)
        }
        // Conditioned on the keys and access read above: a visibility change
        // that moved this photo's files meanwhile wins, and these are dropped.
        const { count } = await prisma.photo.updateMany({
          where: {
            id: photo.id, imagesPublic: photo.imagesPublic,
            thumbKey: photo.thumbKey, mediumKey: photo.mediumKey, largeKey: photo.largeKey,
          },
          data: {
            thumbKey: keys.thumbKey, mediumKey: keys.mediumKey, largeKey: keys.largeKey,
            ...storedPaths(keys, photo.imagesPublic),
            blurHash: derivatives.blurHash,
            perceptualHash: derivatives.perceptualHash,
            derivativeBytes: derivatives.thumb.length + derivatives.medium.length + derivatives.large.length,
            format: identified.format,
            originalSha256, imageSha256, scannerModel,
          },
        })
        if (count === 0) throw new Error('changed while it was being processed; it will be picked up next run')
      } catch (error) {
        await Promise.all(written.map(key => deleteFromOSS(key).catch(() => {})))
        throw error
      }
      done++
      if (done % 25 === 0) console.log(`  ${done} of ${photos.length}, ${((Date.now() - started) / done / 1000).toFixed(1)}s each`)
    } catch (error) {
      failed++
      console.error(`  ${photo.id}: ${error instanceof Error ? error.message : error}`)
    }
  }

  const seconds = (Date.now() - started) / 1000
  console.log(`${args.write ? 'Done' : 'Sampled'}: ${done} photos in ${seconds.toFixed(0)}s${done ? `, ${(seconds / done).toFixed(1)}s each` : ''}, ${failed} failed`)
  if (!args.write) console.log('Dry run: nothing written. Run again with --yes to store these.')
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
