import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand,
  GetObjectCommand, HeadObjectCommand, UploadPartCommand,
} from '@aws-sdk/client-s3'
import { createOssClient } from '@/lib/ossClient'

/**
 * Where an export reads originals from and writes its zips to: the bucket, or
 * with LOCAL_UPLOADS=1 outside production, the local upload folder, as
 * oss.ts does for everything else. Only the export worker and its tests use
 * this; the site reads nothing through it.
 */
export interface ExportStorage {
  /** The stored size of an object, or null when there is none. */
  size(key: string): Promise<number | null>
  /**
   * An object's bytes, from the server's media mirror when it has a copy
   * (`mirrored` says so) unless `bucketOnly`. The caller checks what it reads,
   * and asks the bucket again when a mirrored copy is not the right file.
   */
  read(key: string, options?: { bucketOnly?: boolean }): Promise<{ stream: Readable; mirrored: boolean }>
  /** Starts a zip at `key`, written in order and stored privately once finished. */
  create(key: string): Promise<PartSink>
  remove(key: string): Promise<void>
}

export interface PartSink {
  write(bytes: Uint8Array): Promise<void>
  /** Bytes written so far: the next write's offset in the zip. */
  readonly offset: number
  finish(): Promise<void>
  abort(): Promise<void>
}

/**
 * Pieces of a multipart upload. Within the bucket's limits (100KB to 5GB a
 * piece, 10,000 pieces): a 4GB part is 250 of these, and one is what the
 * worker holds in memory at a time.
 */
const PIECE_BYTES = 16 * 1024 * 1024

class OssPartSink implements PartSink {
  private pieces: { PartNumber: number; ETag: string }[] = []
  private buffered: Uint8Array[] = []
  private bufferedBytes = 0
  offset = 0

  constructor(
    private client: ReturnType<typeof createOssClient>,
    private bucket: string,
    private key: string,
    private uploadId: string,
  ) {}

  async write(bytes: Uint8Array) {
    this.buffered.push(bytes)
    this.bufferedBytes += bytes.length
    this.offset += bytes.length
    if (this.bufferedBytes >= PIECE_BYTES) await this.flush()
  }

  private async flush() {
    if (!this.bufferedBytes) return
    const body = Buffer.concat(this.buffered)
    this.buffered = []
    this.bufferedBytes = 0
    const PartNumber = this.pieces.length + 1
    const { ETag } = await this.client.send(new UploadPartCommand({
      Bucket: this.bucket, Key: this.key, UploadId: this.uploadId, PartNumber, Body: body, ContentLength: body.length,
    }))
    this.pieces.push({ PartNumber, ETag: ETag! })
  }

  async finish() {
    await this.flush()
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket, Key: this.key, UploadId: this.uploadId, MultipartUpload: { Parts: this.pieces },
    }))
  }

  async abort() {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: this.key, UploadId: this.uploadId }))
  }
}

/**
 * The server's copy of the bucket (avoidxray-media-sync, docs/operations.md),
 * which already holds nearly every original: read from disk, an export costs
 * the bucket almost no traffic. Keys come from the database; the path check
 * still refuses one that would leave the folder.
 */
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/var/lib/avoidxray/media'

function mirrorPath(key: string): string | null {
  const full = path.resolve(/*turbopackIgnore: true*/ MEDIA_ROOT, key)
  return full.startsWith(path.resolve(/*turbopackIgnore: true*/ MEDIA_ROOT) + path.sep) ? full : null
}

export function ossExportStorage(): ExportStorage {
  const client = createOssClient({ required: true })
  const bucket = process.env.ALIYUN_OSS_BUCKET!
  return {
    async size(key) {
      const mirrored = mirrorPath(key)
      if (mirrored) {
        try { return (await stat(mirrored)).size } catch { /* not mirrored: ask the bucket */ }
      }
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return head.ContentLength ?? null
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
        throw error
      }
    },
    async read(key, options = {}) {
      const mirrored = options.bucketOnly ? null : mirrorPath(key)
      if (mirrored) {
        try {
          await stat(mirrored)
          return { stream: createReadStream(mirrored), mirrored: true }
        } catch { /* not mirrored */ }
      }
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (!response.Body) throw new Error(`Empty response for ${key}`)
      return { stream: response.Body as Readable, mirrored: false }
    },
    async create(key) {
      const { UploadId } = await client.send(new CreateMultipartUploadCommand({
        Bucket: bucket, Key: key, ACL: 'private', ContentType: 'application/zip', CacheControl: 'private, no-store',
      }))
      return new OssPartSink(client, bucket, key, UploadId!)
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
  }
}

/** The local upload folder, for development and the test suite. */
export function localExportStorage(root = path.join(process.cwd(), 'public', 'local-uploads')): ExportStorage {
  const file = (key: string) => {
    const relative = key.startsWith('local-uploads/') ? key.slice('local-uploads/'.length) : key
    if (relative.includes('..')) throw new Error(`Refusing to leave the upload folder: ${key}`)
    return path.join(root, relative)
  }
  return {
    async size(key) {
      try { return (await stat(file(key))).size } catch { return null }
    },
    async read(key) {
      return { stream: createReadStream(file(key)), mirrored: false }
    },
    async create(key) {
      const target = file(key)
      await mkdir(path.dirname(target), { recursive: true })
      const partial = `${target}.partial`
      const out = createWriteStream(partial)
      let offset = 0
      return {
        get offset() { return offset },
        async write(bytes) {
          offset += bytes.length
          if (!out.write(bytes)) await new Promise<void>(resolve => out.once('drain', () => resolve()))
        },
        async finish() {
          await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())))
          await rename(partial, target)
        },
        async abort() {
          out.destroy()
          await rm(partial, { force: true })
        },
      }
    },
    async remove(key) {
      await rm(file(key), { force: true })
    },
  }
}

/** The storage this environment exports through. */
export function exportStorage(): ExportStorage {
  return process.env.LOCAL_UPLOADS === '1' && process.env.NODE_ENV !== 'production' ? localExportStorage() : ossExportStorage()
}
