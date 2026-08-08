import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

const client = new S3Client({
  region: process.env.ALIYUN_OSS_REGION!,
  endpoint: `https://${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`,
  credentials: {
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET!,
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
  }))
  return `https://${bucket}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com/${key}`
}

export async function deleteFromOSS(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
}

export async function listOSSObjects(prefix?: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))

    if (response.Contents) {
      keys.push(...response.Contents.map(obj => obj.Key!).filter(Boolean))
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return keys
}
