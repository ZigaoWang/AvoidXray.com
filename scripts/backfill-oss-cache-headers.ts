/**
 * Set Cache-Control on objects uploaded before uploadToOSS started sending it.
 *
 * The bucket previously returned only ETag/Last-Modified, so browsers
 * revalidated every image on every repeat view and Next's image optimizer fell
 * back to a short TTL and re-encoded the same files repeatedly.
 *
 * Object storage has no "set metadata" verb — the way to change headers is to
 * copy an object onto itself with REPLACE metadata. That rewrites the header
 * without re-uploading bytes through this machine.
 *
 *   npx tsx scripts/backfill-oss-cache-headers.ts --dry
 *   npx tsx scripts/backfill-oss-cache-headers.ts
 *
 * Idempotent: objects that already carry the header are skipped.
 */

import {
  S3Client,
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

const DRY_RUN = process.argv.includes('--dry')
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const CONCURRENCY = 8

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

const region = requireEnv('ALIYUN_OSS_REGION')
const bucket = requireEnv('ALIYUN_OSS_BUCKET')

const client = new S3Client({
  region,
  endpoint: `https://${region}.aliyuncs.com`,
  credentials: {
    accessKeyId: requireEnv('ALIYUN_OSS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('ALIYUN_OSS_ACCESS_KEY_SECRET'),
  },
})

async function listAllKeys(): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined

  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token })
    )
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key)
    token = res.NextContinuationToken
  } while (token)

  return keys
}

async function main() {
  const keys = await listAllKeys()
  console.log(`\n${keys.length} object(s) in ${bucket}${DRY_RUN ? ' (dry run)' : ''}\n`)

  let updated = 0
  let skipped = 0
  let failed = 0
  let cursor = 0

  async function worker() {
    while (cursor < keys.length) {
      const key = keys[cursor++]
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        if (head.CacheControl === CACHE_CONTROL) {
          skipped++
          continue
        }

        if (!DRY_RUN) {
          await client.send(
            new CopyObjectCommand({
              Bucket: bucket,
              Key: key,
              CopySource: `/${bucket}/${encodeURIComponent(key)}`,
              CacheControl: CACHE_CONTROL,
              // Preserve the type; without REPLACE the original metadata is kept
              // and the new CacheControl would be silently discarded.
              ContentType: head.ContentType,
              MetadataDirective: 'REPLACE',
            })
          )
        }
        updated++
        if (updated % 200 === 0) console.log(`  ${updated} updated`)
      } catch (err) {
        failed++
        console.warn(`  failed ${key}: ${(err as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(
    `\n${updated} ${DRY_RUN ? 'would be updated' : 'updated'}, ${skipped} already set, ${failed} failed\n`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
