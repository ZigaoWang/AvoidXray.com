import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { contentTypeForKey } from './contentType'
import { createOssClient } from './ossClient'
import { extractKeyFromUrl, LOCAL_UPLOAD_PREFIX } from './ossUtils'

/**
 * Uploads kept on this machine, for development only.
 *
 * Local copies of the site used the production bucket, so trying an upload on
 * localhost put a real file at a public URL. With LOCAL_UPLOADS=1, and never
 * in production, files are written under public/local-uploads and Next serves
 * them from there. The vision worker reads them from the same folder.
 */
const LOCAL_UPLOADS = process.env.LOCAL_UPLOADS === '1' && process.env.NODE_ENV !== 'production'
const LOCAL_DIR = path.join(process.cwd(), 'public', 'local-uploads')

function localPath(key: string): string | null {
  const relative = key.startsWith('local-uploads/') ? key.slice('local-uploads/'.length) : key
  return relative.includes('..') ? null : path.join(LOCAL_DIR, relative)
}

/** Timeouts and retries are set in ossClient.ts, shared with the scripts. */
const client = createOssClient()

const bucket = process.env.ALIYUN_OSS_BUCKET!

/**
 * Objects here are content-addressed — the key contains a UUID or a timestamp,
 * and a changed image is written under a new key rather than overwriting. They
 * can therefore be cached indefinitely.
 *
 * Without this header the bucket returned only ETag/Last-Modified, so every
 * repeat view revalidated each image over the network, and Next's image
 * optimizer fell back to its short minimum TTL and re-encoded constantly.
 */
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'


export async function uploadToOSS(buffer: Buffer, key: string): Promise<string> {
  if (LOCAL_UPLOADS) {
    const file = localPath(key)
    if (!file) throw new Error(`Refusing to store outside the upload folder: ${key}`)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, buffer)
    return `${LOCAL_UPLOAD_PREFIX}${key}`
  }
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    CacheControl: IMMUTABLE_CACHE_CONTROL,
    ContentType: contentTypeForKey(key),
  }))
  return `https://${bucket}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com/${key}`
}

export async function deleteFromOSS(key: string): Promise<void> {
  if (LOCAL_UPLOADS) {
    const file = localPath(key)
    if (file) await unlink(file).catch(() => {})
    return
  }
  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
}

/**
 * Drops the object a stored URL points at, once nothing points at it any more.
 *
 * Order matters, and only in one direction. Delete first and a failed write
 * leaves a record naming a file that is gone: every visitor sees a broken
 * image, and nothing can repair it because the bytes are unrecoverable. Write
 * first and a failed delete leaves a file nothing references, which costs
 * storage until the orphan sweep collects it. So the database moves first and
 * this runs after.
 *
 * Which is also why it never throws. By the time it runs the change has
 * already been made and reported, and a delete that cannot find its object has
 * nothing to say.
 */
export async function discardStoredImage(url: string | null | undefined): Promise<void> {
  if (!url) return
  const key = extractKeyFromUrl(url)
  if (!key) return
  await deleteFromOSS(key).catch((error) => {
    console.error('[OSS] Could not discard', key, error)
  })
}

/**
 * Deletes objects whose rows are already gone, a few at a time.
 *
 * The same ordering rule as discardStoredImage, for many files: callers delete
 * rows first and pass the keys of the rows that actually went. Bounded because
 * deleting a user fanned out one request per file all at once, three per
 * photo, and failures were swallowed without a trace; now each one is logged
 * so the orphan sweep is not the only record of it.
 */
export async function discardStoredKeys(keys: string[], context: string): Promise<void> {
  const DELETE_CONCURRENCY = 8
  let cursor = 0
  let failed = 0

  async function worker() {
    while (cursor < keys.length) {
      const key = keys[cursor++]
      try {
        await deleteFromOSS(key)
      } catch (error) {
        failed++
        console.error(`[OSS] ${context}: could not delete ${key}`, error)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, keys.length) }, worker))
  if (failed) console.error(`[OSS] ${context}: ${failed} of ${keys.length} deletes failed`)
}

/** One stored object, with enough to tell a stale orphan from a fresh one. */
export interface OSSObject {
  key: string
  /** When the object was written, for callers deciding whether to delete it. */
  lastModified: Date | null
}

export async function listOSSObjects(prefix?: string): Promise<OSSObject[]> {
  // Nothing to sweep: the orphan check compares against the bucket.
  if (LOCAL_UPLOADS) return []
  const objects: OSSObject[] = []
  let continuationToken: string | undefined

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) objects.push({ key: obj.Key, lastModified: obj.LastModified ?? null })
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return objects
}
