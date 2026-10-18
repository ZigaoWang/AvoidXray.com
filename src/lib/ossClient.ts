import { S3Client } from '@aws-sdk/client-s3'

/**
 * The one way to build a client for the bucket, for the site and for scripts.
 *
 * Each script used to construct its own, and none of them carried the
 * timeouts oss.ts had learned to set, so a stalled connection in a backfill
 * hung it with no error. Kept apart from oss.ts, which pulls in the upload
 * helpers and the local-uploads folder, so a script can import this alone.
 *
 * Both timeouts default to disabled in the SDK, so a stalled connection never
 * settles. An upload holds the source buffer, the rotated buffer and two
 * renditions in memory while it waits, and a few of those at once add up. A
 * request that is going to fail should fail quickly enough for the caller to
 * say so.
 *
 * `required` throws on a missing variable instead of building a client that
 * fails on its first request with a signature error. Scripts want that; the
 * site builds its client at import, where a development checkout may have no
 * bucket at all (instrumentation.ts warns about it instead).
 */
export function createOssClient({ required = false }: { required?: boolean } = {}): S3Client {
  // Undefined rather than empty when missing and not required: the SDK
  // refuses an empty region at construction, which would take down every
  // import of oss.ts, but resolves an undefined one lazily.
  const read = (name: string): string => {
    const value = process.env[name]
    if (required && !value) throw new Error(`Missing required environment variable ${name}`)
    return value as string
  }
  const region = read('ALIYUN_OSS_REGION')
  return new S3Client({
    region,
    endpoint: `https://${region}.aliyuncs.com`,
    credentials: {
      accessKeyId: read('ALIYUN_OSS_ACCESS_KEY_ID'),
      secretAccessKey: read('ALIYUN_OSS_ACCESS_KEY_SECRET'),
    },
    maxAttempts: 3,
    requestHandler: {
      connectionTimeout: 5_000,
      // Generous: a 50MB original over a slow connection is a legitimate case,
      // and the point is to end a stall, not to cut off a slow success.
      requestTimeout: 120_000,
    },
  })
}
