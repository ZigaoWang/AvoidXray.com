/**
 * Set Cache-Control and Content-Type on objects written before uploadToOSS sent
 * them.
 *
 * The bucket previously returned only ETag/Last-Modified, so browsers
 * revalidated every image on every repeat view and Next's image optimizer fell
 * back to a short TTL and re-encoded the same files repeatedly.
 *
 * Object storage has no "set metadata" verb — the way to change headers is to
 * copy an object onto itself with REPLACE metadata. That rewrites the header
 * without re-uploading bytes through this machine.
 *
 * Only image prefixes are touched. The first version walked the whole bucket,
 * which includes backups/db/: database dumps uploaded explicitly private. A
 * copy without an ACL header resets the object to the bucket default, which is
 * public, so rewriting a dump would have published the user table. For the
 * same reason every object's ACL is read first and anything not already
 * publicly readable is left alone and reported.
 *
 *   npx tsx scripts/backfill-oss-cache-headers.ts           # report only
 *   npx tsx scripts/backfill-oss-cache-headers.ts --apply   # rewrite headers
 *
 * Idempotent: objects that already carry the header are skipped.
 */

import {
  S3Client,
  CopyObjectCommand,
  GetObjectAclCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { contentTypeForKey } from '../src/lib/contentType'

const DRY_RUN = !process.argv.includes('--apply')
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const CONCURRENCY = 8

/**
 * Where uploadToOSS writes images: photo variants (lib/image), avatars, and
 * camera and film stock pictures (generateImageKey). Everything else in the
 * bucket, backups above all, is out of bounds.
 */
const IMAGE_PREFIXES = ['originals/', 'medium/', 'thumbs/', 'avatars/', 'cameras/', 'filmstocks/']
const ALL_USERS = 'http://acs.amazonaws.com/groups/global/AllUsers'

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

async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined

  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    )
    for (const obj of res.Contents ?? []) {
      // The prefix filter is the server's; checked again so a misbehaving
      // listing can never hand this loop a key outside the image folders.
      if (obj.Key && IMAGE_PREFIXES.some((p) => obj.Key!.startsWith(p))) keys.push(obj.Key)
    }
    token = res.NextContinuationToken
  } while (token)

  return keys
}

/**
 * Whether anonymous readers can fetch the object today. Copying onto itself
 * without an ACL header leaves it on the bucket default (public), so only
 * objects that are already public can be rewritten without changing who can
 * see them.
 */
async function isPublic(key: string): Promise<boolean> {
  const acl = await client.send(new GetObjectAclCommand({ Bucket: bucket, Key: key }))
  return (acl.Grants ?? []).some(
    (g) => g.Grantee?.URI === ALL_USERS && (g.Permission === 'READ' || g.Permission === 'FULL_CONTROL')
  )
}

async function main() {
  const keys: string[] = []
  for (const prefix of IMAGE_PREFIXES) keys.push(...(await listKeys(prefix)))
  console.log(`\n${keys.length} image object(s) in ${bucket}${DRY_RUN ? ' (dry run, pass --apply to write)' : ''}\n`)

  let updated = 0
  let skipped = 0
  let notPublic = 0
  let failed = 0
  let cursor = 0

  async function worker() {
    while (cursor < keys.length) {
      const key = keys[cursor++]
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        const wantedType = contentTypeForKey(key)
        if (head.CacheControl === CACHE_CONTROL && head.ContentType === wantedType) {
          skipped++
          continue
        }

        if (!(await isPublic(key))) {
          notPublic++
          console.warn(`  left alone, not publicly readable: ${key}`)
          continue
        }

        if (!DRY_RUN) {
          await client.send(
            new CopyObjectCommand({
              Bucket: bucket,
              Key: key,
              CopySource: `/${bucket}/${encodeURIComponent(key)}`,
              CacheControl: CACHE_CONTROL,
              // Derived from the key rather than preserved: objects written
              // before uploadToOSS set a type are stored as octet-stream, which
              // blocks Aliyun's image processing. MetadataDirective REPLACE is
              // required or the new headers are silently discarded.
              ContentType: contentTypeForKey(key),
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
    `\n${updated} ${DRY_RUN ? 'would be updated' : 'updated'}, ${skipped} already set, ` +
      `${notPublic} left alone as not public, ${failed} failed\n`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
