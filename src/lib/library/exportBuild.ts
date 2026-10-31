import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { prisma } from '@/lib/db'
import { centralDirectory, crc32, dosStamp, localHeader, type ZipRecord } from '@/lib/zip'
import { exportEntries, metadataFiles, partKey, planParts, type ExportEntry, type MetadataRow, type StoredPart } from './exports'
import type { ExportStorage } from './exportStorage'

/**
 * Builds a queued LibraryExport: reads each original once, writes the zip
 * parts straight into storage, and returns what it stored.
 *
 * Originals are read from the server's media mirror where it has them, and
 * from the bucket otherwise. Each is first copied to a temporary file while
 * its checksum is taken, because a zip names the checksum before the bytes. That keeps the
 * archive plain (no data descriptors, which some unzip tools mishandle) and
 * means every original crosses the network once. Only one original and one
 * 16MB upload piece are held at a time.
 *
 * Every original is checked against the sha256 recorded at upload, so what
 * the zip holds is the file exactly as it was uploaded or the build fails.
 */

export interface BuildOptions {
  storage: ExportStorage
  /** The most bytes a second this reads from storage, so a build never crowds out the site. */
  readBytesPerSecond: number
  /**
   * The most bytes a second it writes the zips to storage. Paced apart from
   * reads: with the originals coming from the local mirror, the upload is
   * the only traffic, and unpaced it would take the uplink pages go out on.
   */
  writeBytesPerSecond?: number
  onProgress?: (done: number) => Promise<void> | void
  /** Checked between photos; true stops the build. */
  shouldStop?: () => boolean
  /** A smaller part size, for the tests. */
  partMaxBytes?: number
}

export interface BuildResult {
  parts: StoredPart[]
  bytes: number
  skipped: number
  /** Originals read from the bucket: the traffic the build cost. */
  bytesRead: number
  /** Originals read from the server's media mirror instead. */
  bytesFromMirror: number
  bytesWritten: number
}

/** Paces reads to an average rate, measured from the start of the build. */
class Pace {
  private started = Date.now()
  private total = 0
  constructor(private bytesPerSecond: number) {}
  async take(bytes: number) {
    this.total += bytes
    const due = this.started + (this.total / this.bytesPerSecond) * 1000
    const wait = due - Date.now()
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  }
}

/** Copies a stream to a file, paced when `pace` is given, and returns its size, crc and sha256. */
async function download(stream: Readable, file: string, pace: Pace | null): Promise<{ size: number; crc: number; sha256: string }> {
  const out = createWriteStream(file)
  const hash = createHash('sha256')
  let crc = 0
  let size = 0
  try {
    for await (const chunk of stream) {
      const bytes = chunk as Uint8Array
      crc = crc32(bytes, crc)
      hash.update(bytes)
      size += bytes.length
      if (!out.write(bytes)) await new Promise<void>(resolve => out.once('drain', () => resolve()))
      await pace?.take(bytes.length)
    }
  } finally {
    await new Promise<void>(resolve => out.end(resolve))
  }
  return { size, crc, sha256: hash.digest('hex') }
}

export async function buildExport(exportId: string, options: BuildOptions): Promise<BuildResult> {
  const job = await prisma.libraryExport.findUniqueOrThrow({
    where: { id: exportId },
    select: { userId: true, title: true, photoIds: true, createdAt: true },
  })
  const { storage } = options
  const entries = await exportEntries(job.userId, job.photoIds)

  // Sizes from storage, which also finds the originals that are gone, so
  // every part's metadata can say which photos are missing before any part
  // is written.
  const sized: (ExportEntry & { bytes: number | null; missing: boolean })[] = []
  for (const entry of entries) {
    const size = await storage.size(entry.originalKey)
    sized.push({ ...entry, bytes: size ?? entry.bytes, missing: size === null })
  }
  const present = sized.filter(e => !e.missing)

  const exportedAt = new Date()
  const stamp = dosStamp(exportedAt)
  // Room for the metadata files: measured on the whole list, with headroom
  // for the part numbers, plus the directory records.
  const draft = metadataFiles(sized.map(e => ({ ...e.details, part: 99, status: 'ok' as const })), { title: job.title, exportedAt })
  const reserve = 2 * (Buffer.byteLength(draft.csv) + Buffer.byteLength(draft.json)) + 1024 * 1024
  // An export whose originals are all gone still gets one part, holding the metadata that says so.
  const plan = present.length ? planParts(present, reserve, options.partMaxBytes) : [[]]

  const partOf = new Map<string, number>()
  plan.forEach((part, i) => part.forEach(e => partOf.set(e.id, i + 1)))
  const rows: MetadataRow[] = sized.map(e => ({ ...e.details, part: partOf.get(e.id) ?? null, status: e.missing ? 'missing' : 'ok' }))
  const metadata = metadataFiles(rows, { title: job.title, exportedAt })

  const encoder = new TextEncoder()
  const pace = new Pace(options.readBytesPerSecond)
  const writePace = new Pace(options.writeBytesPerSecond ?? options.readBytesPerSecond)
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'avx-export-'))
  const token = randomUUID()
  const stored: StoredPart[] = []
  let bytesRead = 0
  let bytesFromMirror = 0
  let done = 0

  try {
    for (const [i, part] of plan.entries()) {
      if (options.shouldStop?.()) throw new Error('Stopped')
      const key = partKey(exportId, i + 1, token)
      const target = await storage.create(key)
      const sink = {
        get offset() { return target.offset },
        write: async (bytes: Uint8Array) => { await target.write(bytes); await writePace.take(bytes.length) },
        finish: () => target.finish(),
        abort: () => target.abort(),
      }
      const records: ZipRecord[] = []
      try {
        const add = async (name: string, size: number, crc: number, body: () => AsyncIterable<Uint8Array> | Iterable<Uint8Array>) => {
          const record = { name: encoder.encode(name), size, crc, offset: sink.offset }
          await sink.write(localHeader(record, stamp))
          let written = 0
          for await (const chunk of body()) {
            await sink.write(chunk)
            written += chunk.length
          }
          if (written !== size) throw new Error(`Wrote ${written} bytes of ${name}, expected ${size}`)
          records.push(record)
        }

        for (const entry of part) {
          if (options.shouldStop?.()) throw new Error('Stopped')
          const file = path.join(tmp, 'original')
          const source = await storage.read(entry.originalKey)
          // Only the bucket is paced: the mirror is this machine's own disk.
          let got = await download(source.stream, file, source.mirrored ? null : pace)
          if (source.mirrored) bytesFromMirror += got.size
          else bytesRead += got.size
          if (source.mirrored && entry.sha256 && got.sha256 !== entry.sha256) {
            // A stale or damaged mirror copy: the bucket's is the original.
            got = await download((await storage.read(entry.originalKey, { bucketOnly: true })).stream, file, pace)
            bytesRead += got.size
          }
          if (entry.sha256 && got.sha256 !== entry.sha256) {
            throw new Error(`The stored original of photo ${entry.id} does not match the one uploaded`)
          }
          await add(entry.path, got.size, got.crc, () => createReadStream(file, { highWaterMark: 1024 * 1024 }))
          await rm(file, { force: true })
          done++
          await options.onProgress?.(done)
        }

        for (const [name, text] of [['photos.csv', metadata.csv], ['photos.json', metadata.json]] as const) {
          const bytes = encoder.encode(text)
          await add(name, bytes.length, crc32(bytes), () => [bytes])
        }
        const directoryAt = sink.offset
        for (const chunk of centralDirectory(records, directoryAt, stamp)) await sink.write(chunk)
        if (sink.offset >= 2 ** 32) throw new Error(`Part ${i + 1} reached ${sink.offset} bytes, past what a zip without ZIP64 holds`)
        await sink.finish()
      } catch (error) {
        await sink.abort().catch(() => {})
        throw error
      }
      stored.push({ key, bytes: sink.offset, photos: part.length })
    }
  } catch (error) {
    // Nothing half-built stays behind: the parts already finished go too.
    for (const part of stored) await storage.remove(part.key).catch(() => {})
    throw error
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }

  const bytes = stored.reduce((sum, p) => sum + p.bytes, 0)
  return { parts: stored, bytes, skipped: sized.length - present.length, bytesRead, bytesFromMirror, bytesWritten: bytes }
}
