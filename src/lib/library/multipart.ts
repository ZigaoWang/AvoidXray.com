import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectAclCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createOssClient } from '@/lib/ossClient'
import { contentTypeForKey } from '@/lib/contentType'

/**
 * Multipart uploads straight from the browser to the bucket.
 *
 * The server starts each upload and signs one URL per part; the browser PUTs
 * the parts itself, so a scan never passes through this machine. The finished
 * object is made private when the upload completes: the bucket ignores the
 * ACL an upload is started with, so the object would otherwise take the
 * bucket's public default. Nothing here trusts the browser's account of what it
 * sent: completing reads the bucket's own list of parts.
 *
 * With LOCAL_UPLOADS=1 outside production the same calls are served from
 * public/local-uploads, with part URLs pointing at a local route
 * (/api/library/local-parts), so the flow can be run without the bucket.
 */

/** Parts are this size except the last. S3 needs at least 5 MiB. */
export const PART_SIZE = 8 * 1024 * 1024

/** How long a signed part URL stays good. */
const PART_URL_SECONDS = 60 * 60

export const LOCAL_MULTIPART = process.env.LOCAL_UPLOADS === '1' && process.env.NODE_ENV !== 'production'

const client = createOssClient()
const bucket = process.env.ALIYUN_OSS_BUCKET!

/** Private for good: shared caches must not keep it, the owner's browser may. */
const ORIGINAL_CACHE_CONTROL = 'private, max-age=31536000, immutable'

export interface UploadedPart {
  partNumber: number
  etag: string
  bytes: number
}

export function partCount(bytes: number, partSize = PART_SIZE): number {
  return Math.max(1, Math.ceil(bytes / partSize))
}

/** Starts a private multipart upload at `key` and returns its id. */
export async function startUpload(key: string): Promise<string> {
  if (LOCAL_MULTIPART) {
    const uploadId = randomUUID()
    await mkdir(localPartsDir(uploadId), { recursive: true })
    return uploadId
  }
  const { UploadId } = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ACL: 'private',
    CacheControl: ORIGINAL_CACHE_CONTROL,
    ContentType: contentTypeForKey(key),
  }))
  if (!UploadId) throw new Error(`The bucket started no upload for ${key}`)
  return UploadId
}

/** Signed URLs the browser PUTs each part's bytes to, by part number. */
export async function signParts(key: string, uploadId: string, partNumbers: number[]): Promise<Record<number, string>> {
  const urls: Record<number, string> = {}
  for (const partNumber of partNumbers) {
    urls[partNumber] = LOCAL_MULTIPART
      ? localPartUrl(uploadId, partNumber)
      : await getSignedUrl(
        client,
        new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: PART_URL_SECONDS },
      )
  }
  return urls
}

/** The parts the bucket holds for an upload, in order. */
export async function listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
  if (LOCAL_MULTIPART) return listLocalParts(uploadId)
  const parts: UploadedPart[] = []
  let marker: string | undefined
  for (;;) {
    const page = await client.send(new ListPartsCommand({
      Bucket: bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker,
    }))
    for (const part of page.Parts ?? []) {
      if (part.PartNumber && part.ETag) parts.push({ partNumber: part.PartNumber, etag: part.ETag, bytes: part.Size ?? 0 })
    }
    if (!page.IsTruncated || !page.NextPartNumberMarker) break
    marker = page.NextPartNumberMarker
  }
  return parts.sort((a, b) => a.partNumber - b.partNumber)
}

/**
 * Joins the stored parts into the object, once they are every part and add up
 * to the size the file was registered with. Returns null when they do not,
 * with what is wrong, so the browser can send what is missing.
 */
export async function completeUpload(
  key: string,
  uploadId: string,
  expected: { bytes: number; partSize: number },
): Promise<{ ok: true } | { ok: false; missing: number[]; reason: string }> {
  const parts = await listParts(key, uploadId)
  const count = partCount(expected.bytes, expected.partSize)
  const have = new Set(parts.map(p => p.partNumber))
  const missing = Array.from({ length: count }, (_, i) => i + 1).filter(n => !have.has(n))
  if (missing.length) return { ok: false, missing, reason: `${missing.length} of ${count} parts are not stored yet` }
  const stored = parts.filter(p => p.partNumber <= count).reduce((sum, p) => sum + p.bytes, 0)
  if (parts.length !== count || stored !== expected.bytes) {
    return { ok: false, missing: [], reason: `the parts hold ${stored} bytes in ${parts.length} parts, not ${expected.bytes} in ${count}` }
  }

  if (LOCAL_MULTIPART) {
    await joinLocalParts(uploadId, key, count)
  } else {
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }))
    // Set again on the finished object: the bucket ignores the ACL a multipart
    // upload is started with, and the object would take its public default.
    await client.send(new PutObjectAclCommand({ Bucket: bucket, Key: key, ACL: 'private' }))
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    if (head.ContentLength !== expected.bytes) {
      throw new Error(`The stored object is ${head.ContentLength} bytes, not ${expected.bytes}`)
    }
  }
  return { ok: true }
}

/** Throws the stored parts away. Safe to call on an upload already gone. */
export async function abortUpload(key: string, uploadId: string): Promise<void> {
  if (LOCAL_MULTIPART) {
    await rm(localPartsDir(uploadId), { recursive: true, force: true })
    return
  }
  try {
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }))
  } catch (error) {
    if ((error as { name?: string }).name !== 'NoSuchUpload') throw error
  }
}

// --- Local emulation ----------------------------------------------------------

const LOCAL_ROOT = path.join(process.cwd(), 'public', 'local-uploads')
const localPartsDir = (uploadId: string) => path.join(LOCAL_ROOT, '.multipart', uploadId)

/** A key for signing local part URLs, so the local route takes only parts it was asked for. */
function localSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is needed to sign local part URLs')
  return secret
}

function localSignature(uploadId: string, partNumber: number, expires: number): string {
  return createHmac('sha256', localSecret()).update(`${uploadId}:${partNumber}:${expires}`).digest('hex')
}

function localPartUrl(uploadId: string, partNumber: number): string {
  const expires = Date.now() + PART_URL_SECONDS * 1000
  const params = new URLSearchParams({
    uploadId, part: String(partNumber), expires: String(expires), sig: localSignature(uploadId, partNumber, expires),
  })
  return `/api/library/local-parts?${params}`
}

/** Checks a local part URL's signature; returns the upload and part it names. */
export function verifyLocalPartUrl(params: URLSearchParams): { uploadId: string; partNumber: number } | null {
  if (!LOCAL_MULTIPART) return null
  const uploadId = params.get('uploadId') ?? ''
  const partNumber = Number(params.get('part'))
  const expires = Number(params.get('expires'))
  const sig = params.get('sig') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(uploadId) || !Number.isInteger(partNumber) || partNumber < 1 || !(expires > Date.now())) return null
  const expected = Buffer.from(localSignature(uploadId, partNumber, expires))
  const given = Buffer.from(sig)
  return given.length === expected.length && timingSafeEqual(given, expected) ? { uploadId, partNumber } : null
}

/** Stores one part locally and returns its ETag, as the bucket would. */
export async function storeLocalPart(uploadId: string, partNumber: number, bytes: Buffer): Promise<string> {
  const dir = localPartsDir(uploadId)
  await stat(dir)
  await writeFile(path.join(dir, String(partNumber)), bytes)
  return `"${createHash('md5').update(bytes).digest('hex')}"`
}

async function listLocalParts(uploadId: string): Promise<UploadedPart[]> {
  const dir = localPartsDir(uploadId)
  const names = await readdir(dir).catch(() => [] as string[])
  const parts: UploadedPart[] = []
  for (const name of names) {
    const partNumber = Number(name)
    if (!Number.isInteger(partNumber)) continue
    const bytes = await readFile(path.join(dir, name))
    parts.push({ partNumber, etag: `"${createHash('md5').update(bytes).digest('hex')}"`, bytes: bytes.length })
  }
  return parts.sort((a, b) => a.partNumber - b.partNumber)
}

async function joinLocalParts(uploadId: string, key: string, count: number) {
  const target = path.join(LOCAL_ROOT, key)
  if (!target.startsWith(LOCAL_ROOT + path.sep)) throw new Error(`Refusing to write outside the upload folder: ${key}`)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, Buffer.alloc(0))
  for (let n = 1; n <= count; n++) {
    await appendFile(target, await readFile(path.join(localPartsDir(uploadId), String(n))))
  }
  await rm(localPartsDir(uploadId), { recursive: true, force: true })
}
