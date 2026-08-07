/**
 * Backfill Photo.originalBytes for rows uploaded before the column existed.
 *
 * Issues one HeadObject per photo — the call the page used to make on every
 * render — but once, offline, instead of on the request path. Safe to re-run:
 * only rows with a null originalBytes are touched.
 *
 *   npx tsx scripts/backfill-photo-sizes.ts          # apply
 *   npx tsx scripts/backfill-photo-sizes.ts --dry    # report only
 *
 * Requires the ALIYUN_OSS_* variables, so run it on the server where .env lives.
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry')

/** Object storage rate-limits aggressive parallelism, and this is not urgent. */
const CONCURRENCY = 8

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

async function main() {
  const region = requireEnv('ALIYUN_OSS_REGION')
  const bucket = requireEnv('ALIYUN_OSS_BUCKET')

  const oss = new S3Client({
    region,
    endpoint: `https://${region}.aliyuncs.com`,
    credentials: {
      accessKeyId: requireEnv('ALIYUN_OSS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('ALIYUN_OSS_ACCESS_KEY_SECRET'),
    },
  })

  const photos = await prisma.photo.findMany({
    where: { originalBytes: null },
    select: { id: true, originalPath: true },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`\n${photos.length} photo(s) missing originalBytes${DRY_RUN ? ' (dry run)' : ''}\n`)
  if (photos.length === 0) return

  let updated = 0
  let failed = 0

  // Simple fixed-size worker pool over a shared cursor.
  let cursor = 0
  async function worker() {
    while (cursor < photos.length) {
      const photo = photos[cursor++]
      try {
        const key = new URL(photo.originalPath).pathname.slice(1)
        const head = await oss.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        const bytes = head.ContentLength

        // A zero or absent length means the object is missing or empty; leaving
        // the column null is more honest than recording 0.
        if (!bytes || bytes <= 0) {
          failed++
          console.warn(`  no size for ${photo.id}`)
          continue
        }

        if (!DRY_RUN) {
          await prisma.photo.update({ where: { id: photo.id }, data: { originalBytes: bytes } })
        }
        updated++
        if (updated % 100 === 0) console.log(`  ${updated}/${photos.length}`)
      } catch (err) {
        failed++
        console.warn(`  failed ${photo.id}: ${(err as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`\n${updated} ${DRY_RUN ? 'would be updated' : 'updated'}, ${failed} failed\n`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
