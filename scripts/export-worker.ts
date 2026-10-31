/**
 * Builds the library's queued exports of original files
 * (src/lib/library/exportBuild.ts) and deletes them once their links expire.
 *
 * Runs as its own pm2 process, `avoidxray-exports`, like the import worker: one
 * export at a time, at the lowest CPU priority, reading from the bucket at
 * EXPORT_READ_MBPS and writing zips at EXPORT_WRITE_MBPS at most (8 each by
 * default, about half of what one connection from the server reaches), so a
 * 10GB library takes a while rather than taking the site's bandwidth. It holds one original on disk and one 16MB upload
 * piece in memory.
 *
 * An export whose worker died is claimed again after STALE_MS without
 * progress; after MAX_ATTEMPTS it is failed. A stopped worker puts the export
 * in hand back in the queue.
 *
 *   npx tsx scripts/export-worker.ts          # run until stopped
 *   npx tsx scripts/export-worker.ts --once   # build what is queued, sweep, and exit
 */
import 'dotenv/config'
import os from 'node:os'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/db'
import { EXPORT_DAYS, type StoredPart } from '../src/lib/library/exports'
import { buildExport } from '../src/lib/library/exportBuild'
import { exportStorage } from '../src/lib/library/exportStorage'

const IDLE_POLL_MS = 5000
const SWEEP_EVERY_MS = 10 * 60 * 1000
const STALE_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 3
/** Progress is written at most this often; it is also what shows the build is alive. */
const PROGRESS_MS = 5000
const READ_BYTES_PER_SECOND = (Number(process.env.EXPORT_READ_MBPS) || 8) * 1e6
const WRITE_BYTES_PER_SECOND = (Number(process.env.EXPORT_WRITE_MBPS) || 8) * 1e6

const log = (...args: unknown[]) => console.log(new Date().toISOString(), '[exports]', ...args)
const storage = exportStorage()
let stopping = false

async function claim(): Promise<{ id: string; userId: string; attempts: number } | null> {
  const rows = await prisma.$queryRaw<{ id: string; userId: string; attempts: number }[]>`
    UPDATE "LibraryExport" SET state = 'building', attempts = attempts + 1, "startedAt" = now(), "updatedAt" = now(), done = 0
    WHERE id = (
      SELECT id FROM "LibraryExport"
      WHERE (state = 'queued' AND "updatedAt" <= now())
         OR (state = 'building' AND attempts < ${MAX_ATTEMPTS}
             AND "updatedAt" < now() - make_interval(secs => ${STALE_MS / 1000}))
      ORDER BY "createdAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "userId", attempts`
  return rows[0] ?? null
}

/** Tells the owner, on the site, through the bell. The actor is the owner, as for other site notices. */
async function notify(userId: string, type: 'export_ready' | 'export_failed') {
  await prisma.notification.create({ data: { type, userId, actorId: userId } })
}

async function runOnce(): Promise<boolean> {
  const job = await claim()
  if (!job) return false
  const started = Date.now()
  let lastWrite = 0
  log(`${job.id} building (attempt ${job.attempts})`)
  try {
    const result = await buildExport(job.id, {
      storage,
      readBytesPerSecond: READ_BYTES_PER_SECOND,
      writeBytesPerSecond: WRITE_BYTES_PER_SECOND,
      shouldStop: () => stopping,
      onProgress: async done => {
        if (Date.now() - lastWrite < PROGRESS_MS) return
        lastWrite = Date.now()
        await prisma.libraryExport.update({ where: { id: job.id }, data: { done } })
      },
    })
    const finishedAt = new Date()
    await prisma.$transaction([
      prisma.libraryExport.update({
        where: { id: job.id },
        data: {
          state: 'READY',
          parts: result.parts as unknown as Prisma.InputJsonValue,
          bytes: BigInt(result.bytes),
          done: result.parts.reduce((n, p) => n + p.photos, 0),
          skipped: result.skipped,
          bytesRead: BigInt(result.bytesRead),
          bytesWritten: BigInt(result.bytesWritten),
          error: null,
          finishedAt,
          expiresAt: new Date(finishedAt.getTime() + EXPORT_DAYS * 24 * 60 * 60 * 1000),
        },
      }),
      prisma.notification.create({ data: { type: 'export_ready', userId: job.userId, actorId: job.userId } }),
    ])
    log(`${job.id} ready: ${result.parts.length} part(s), ${result.bytes} bytes, ${result.skipped} missing, read ${result.bytesRead} bytes from the bucket and ${result.bytesFromMirror} from the mirror in ${Math.round((Date.now() - started) / 1000)}s`)
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
    if (stopping) {
      // Not the export's fault: back in the queue, this attempt not counted.
      await prisma.libraryExport.update({ where: { id: job.id }, data: { state: 'QUEUED', attempts: { decrement: 1 }, done: 0 } })
      log(`${job.id} put back in the queue: the worker is stopping`)
    } else if (job.attempts >= MAX_ATTEMPTS) {
      await prisma.libraryExport.update({ where: { id: job.id }, data: { state: 'FAILED', error: message, finishedAt: new Date() } })
      await notify(job.userId, 'export_failed').catch(e => log('could not notify', e))
      log(`${job.id} failed: ${message}`)
    } else {
      await prisma.$executeRaw`
        UPDATE "LibraryExport" SET state = 'queued', error = ${message}, done = 0,
          "updatedAt" = now() + make_interval(mins => ${job.attempts * 5})
        WHERE id = ${job.id}`
      log(`${job.id} will be retried: ${message}`)
    }
  }
  return true
}

/** Deletes the zips of exports whose links have expired. */
async function sweep() {
  const expired = await prisma.libraryExport.findMany({
    where: { state: 'READY', expiresAt: { lt: new Date() } },
    select: { id: true, parts: true },
  })
  for (const e of expired) {
    const parts = (e.parts as unknown as StoredPart[] | null) ?? []
    try {
      for (const part of parts) await storage.remove(part.key)
      await prisma.libraryExport.update({ where: { id: e.id }, data: { state: 'EXPIRED', parts: Prisma.DbNull } })
      log(`${e.id} expired: deleted ${parts.length} part(s)`)
    } catch (error) {
      log(`${e.id} could not be deleted yet:`, error instanceof Error ? error.message : error)
    }
  }
}

async function main() {
  const once = process.argv.includes('--once')
  try {
    os.setPriority(19)
  } catch {
    log('could not lower the process priority')
  }
  log(`started, reading and writing the bucket at most ${READ_BYTES_PER_SECOND / 1e6} and ${WRITE_BYTES_PER_SECOND / 1e6} MB/s`)
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => { stopping = true })
  }
  let lastSweep = 0
  while (!stopping) {
    let worked = false
    try {
      if (Date.now() - lastSweep > SWEEP_EVERY_MS) {
        await sweep()
        lastSweep = Date.now()
      }
      worked = await runOnce()
    } catch (error) {
      log('could not read the queue:', error)
    }
    if (!worked) {
      if (once) break
      await new Promise(resolve => setTimeout(resolve, IDLE_POLL_MS))
    }
  }
  await prisma.$disconnect()
}

main()
