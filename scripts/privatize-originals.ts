/**
 * Makes every community original private, and drops the image optimizer's
 * copies of them.
 *
 * Originals were public files at addresses that never changed, and the
 * optimizer kept resized copies of them for a year. Only run this once pages
 * no longer load originals: the code that serves the large version instead is
 * deployed, and scripts/backfill-photo-files.ts has given every photo one. It
 * refuses while any photo still has no large version, since that photo's full
 * size view would fall back to medium.
 *
 * The cache entries are found the way Next names them, a hash of the source
 * address, width, quality and format (getCacheKey in
 * next/dist/server/image-optimizer.js), for every width and format the
 * optimizer could have produced. The optimizer already refuses these
 * addresses (next.config.ts allows no photo prefix), so this is tidying, not
 * the guarantee; the private ACL is.
 *
 * Writes nothing unless --yes is given.
 *
 *   npx tsx scripts/privatize-originals.ts --cache-dir .next/cache/images
 *   npx tsx scripts/privatize-originals.ts --cache-dir .next/cache/images --yes
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { imageConfigDefault } from 'next/dist/shared/lib/image-config'
import { publicObjectUrl, setObjectAccess } from '../src/lib/oss'
import { privateImagePath } from '../src/lib/photoStorage'

/** Must match CACHE_VERSION in next/dist/server/image-optimizer.js for the installed Next. */
const NEXT_IMAGE_CACHE_VERSION = 4

function parseArgs(argv: string[]) {
  const i = argv.indexOf('--cache-dir')
  const cacheDir = i >= 0 ? argv[i + 1] : undefined
  if (!cacheDir) throw new Error('--cache-dir <path to .next/cache/images> is required')
  return { cacheDir, write: argv.includes('--yes') }
}

function cacheKey(href: string, width: number, quality: number, mimeType: string): string {
  const hash = createHash('sha256')
  for (const item of [NEXT_IMAGE_CACHE_VERSION, href, width, quality, mimeType]) hash.update(String(item))
  return hash.digest('base64url')
}

const prisma = new PrismaClient()

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const widths = [...imageConfigDefault.deviceSizes, ...imageConfigDefault.imageSizes]
  const qualities = imageConfigDefault.qualities ?? [75]
  // '' is what the optimizer records when the browser accepted none of the
  // configured formats and got the source's own type back.
  const mimeTypes = [...imageConfigDefault.formats, '']

  const missingLarge = await prisma.photo.count({ where: { kind: 'COMMUNITY', largeKey: null } })
  if (missingLarge > 0) {
    throw new Error(`${missingLarge} photos have no large version yet. Run scripts/backfill-photo-files.ts first.`)
  }

  const photos = await prisma.photo.findMany({
    where: { kind: 'COMMUNITY', originalKey: { not: null } },
    select: { id: true, originalKey: true, originalPath: true },
  })
  console.log(`${photos.length} originals; ${widths.length * qualities.length * mimeTypes.length} cache names checked for each`)

  let made = 0
  let cached = 0
  for (const photo of photos) {
    const key = photo.originalKey!
    const href = publicObjectUrl(key)
    const entries = widths.flatMap(w => qualities.flatMap(q => mimeTypes.map(m => path.join(args.cacheDir, cacheKey(href, w, q, m)))))
    const present = (await Promise.all(entries.map(dir => stat(dir).then(() => dir, () => null)))).filter((d): d is string => d !== null)
    cached += present.length
    if (!args.write) continue

    await setObjectAccess(key, 'private')
    const route = privateImagePath(photo.id, 'original', key)
    if (photo.originalPath !== route) {
      await prisma.photo.update({ where: { id: photo.id }, data: { originalPath: route } })
    }
    await Promise.all(present.map(dir => rm(dir, { recursive: true, force: true })))
    made++
    if (made % 100 === 0) console.log(`  ${made} of ${photos.length}`)
  }

  console.log(`${cached} optimizer cache entries found for these originals`)
  if (args.write) console.log(`Done: ${made} originals made private, their cache entries removed`)
  else console.log('Dry run: nothing written. Run again with --yes.')
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
