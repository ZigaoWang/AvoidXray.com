import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectAclCommand, PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

/**
 * Who can read an object.
 *
 * `inherit` takes the bucket's own setting, which is public-read, and is what
 * avatars and catalog images have always used. Photo files say which they are
 * outright, so they stay what they were made as if the bucket default changes.
 */
export type ObjectAccess = 'inherit' | 'public' | 'private'

const ACL = { inherit: undefined, public: 'public-read', private: 'private' } as const

/** Shared caches must not keep a private file; the viewer's own browser may. */
const cacheControlFor = (access: ObjectAccess) =>
  access === 'private' ? 'private, max-age=31536000, immutable' : IMMUTABLE_CACHE_CONTROL

/** The address a public object is read from. */
export function publicObjectUrl(key: string): string {
  if (LOCAL_UPLOADS) return `${LOCAL_UPLOAD_PREFIX}${key}`
  return `https://${bucket}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com/${key}`
}

export async function uploadToOSS(buffer: Buffer, key: string, access: ObjectAccess = 'inherit'): Promise<string> {
  if (LOCAL_UPLOADS) {
    const file = localPath(key)
    if (!file) throw new Error(`Refusing to store outside the upload folder: ${key}`)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, buffer)
    return publicObjectUrl(key)
  }
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ACL: ACL[access],
    CacheControl: cacheControlFor(access),
    ContentType: contentTypeForKey(key),
  }))
  return publicObjectUrl(key)
}

/**
 * Copies an object to a new key with the given access, inside the bucket.
 *
 * Used to move a photo's files when it is made private: the copy happens on
 * the storage side, so nothing passes through this machine.
 */
export async function copyInOSS(fromKey: string, toKey: string, access: ObjectAccess): Promise<void> {
  if (LOCAL_UPLOADS) {
    const from = localPath(fromKey)
    const to = localPath(toKey)
    if (!from || !to) throw new Error(`Refusing to copy outside the upload folder: ${fromKey}`)
    await mkdir(path.dirname(to), { recursive: true })
    await copyFile(from, to)
    return
  }
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: toKey,
    CopySource: `${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, '/')}`,
    ACL: ACL[access],
    MetadataDirective: 'REPLACE',
    CacheControl: cacheControlFor(access),
    ContentType: contentTypeForKey(toKey),
  }))
}

/** Changes who can read an existing object. */
export async function setObjectAccess(key: string, access: Exclude<ObjectAccess, 'inherit'>): Promise<void> {
  if (LOCAL_UPLOADS) return
  await client.send(new PutObjectAclCommand({ Bucket: bucket, Key: key, ACL: ACL[access] }))
}

/** An object's bytes, read with the site's credentials whatever its access. */
export async function readFromOSS(key: string): Promise<Buffer> {
  if (LOCAL_UPLOADS) {
    const file = localPath(key)
    if (!file) throw new Error(`Refusing to read outside the upload folder: ${key}`)
    return readFile(file)
  }
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!response.Body) throw new Error(`Empty response for ${key}`)
  return Buffer.from(await response.Body.transformToByteArray())
}

/**
 * How long a signed address stays the same.
 *
 * Every address signed within one window is identical, so a browser that saw
 * a private thumbnail a minute ago finds it in its cache instead of fetching
 * it again under a new signature. Each one is valid for between one and two
 * windows from when it is handed out.
 */
export const SIGNED_URL_WINDOW_MS = 60 * 60 * 1000

/** When the current signing window ends, for callers setting cache lifetimes. */
export function signedUrlWindowEnd(now = Date.now()): number {
  return (Math.floor(now / SIGNED_URL_WINDOW_MS) + 1) * SIGNED_URL_WINDOW_MS
}

/**
 * A short-lived address for a private object. Call only after deciding the
 * viewer may see it: whoever holds the address can read the file until it
 * expires.
 *
 * `download` names the file the browser saves it as.
 */
export async function signedObjectUrl(key: string, options: { download?: string } = {}): Promise<string> {
  if (LOCAL_UPLOADS) return publicObjectUrl(key)
  const signingDate = new Date(signedUrlWindowEnd() - SIGNED_URL_WINDOW_MS)
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(options.download
      ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(options.download)}` }
      : {}),
  })
  return getSignedUrl(client, command, { signingDate, expiresIn: (2 * SIGNED_URL_WINDOW_MS) / 1000 })
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
