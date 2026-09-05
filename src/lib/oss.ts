import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { contentTypeForKey } from './contentType'

/**
 * Both timeouts default to disabled, so a stalled connection to the bucket
 * never settles. An upload holds the source buffer, the rotated buffer and two
 * renditions in memory while it waits, and on a 2GB box a few of those at once
 * is the whole machine. A request that is going to fail should fail quickly
 * enough for the caller to say so.
 */
const client = new S3Client({
  region: process.env.ALIYUN_OSS_REGION!,
  endpoint: `https://${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`,
  credentials: {
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET!,
  },
  maxAttempts: 3,
  requestHandler: {
    connectionTimeout: 5_000,
    // Generous: a 50MB original over a slow connection is a legitimate case,
    // and the point is to end a stall, not to cut off a slow success.
    requestTimeout: 120_000,
  },
})

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
  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
}

/** One stored object, with enough to tell a stale orphan from a fresh one. */
export interface OSSObject {
  key: string
  /** When the object was written, for callers deciding whether to delete it. */
  lastModified: Date | null
}

export async function listOSSObjects(prefix?: string): Promise<OSSObject[]> {
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
