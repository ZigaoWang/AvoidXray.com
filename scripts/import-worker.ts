/**
 * Makes photos from files the import page uploaded (src/lib/library).
 *
 * Runs as its own pm2 process, `avoidxray-imports`, so a delivery of hundreds
 * of scans is worked through at its own pace without taking a render slot from
 * the site: one item at a time, one libvips thread, at the lowest CPU
 * priority. Items are claimed with FOR UPDATE SKIP LOCKED, so a second worker
 * would share the queue rather than duplicate it.
 *
 * An item whose worker died mid-way is claimed again once it has sat in
 * processing for STALE_MS; after MAX_ATTEMPTS it is failed with its last error.
 * A failure no retry can fix (the stored bytes are not what was sent, or are
 * not an image) fails the item at once and deletes its original.
 *
 *   npx tsx scripts/import-worker.ts          # run until stopped
 *   npx tsx scripts/import-worker.ts --once   # work through the queue and exit
 */
import 'dotenv/config'
import os from 'node:os'
import sharp from 'sharp'
import { prisma } from '../src/lib/db'
import { deleteFromOSS } from '../src/lib/oss'
import { FinalImportError, processImportItem } from '../src/lib/library/processImportItem'

const IDLE_POLL_MS = 2000
const STALE_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 3

const log = (...args: unknown[]) => console.log(new Date().toISOString(), '[imports]', ...args)

/** The next item to make, marked as being made. */
async function claim(): Promise<{ id: string; attempts: number } | null> {
  const rows = await prisma.$queryRaw<{ id: string; attempts: number }[]>`
    UPDATE "ImportItem" SET state = 'processing', attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "ImportItem"
      WHERE (state = 'uploaded' AND "updatedAt" <= now())
         OR (state = 'processing' AND attempts < ${MAX_ATTEMPTS}
             AND "updatedAt" < now() - make_interval(secs => ${STALE_MS / 1000}))
      ORDER BY "updatedAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, attempts`
  return rows[0] ?? null
}

/**
 * Records a failure. A final one fails the item and deletes its original; any
 * other puts it back in the queue a minute later per attempt so far, so an
 * outage is not retried in a tight loop.
 */
async function fail(id: string, attempts: number, error: unknown, final: boolean) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
  if (!final) {
    await prisma.$executeRaw`
      UPDATE "ImportItem" SET state = 'uploaded', error = ${message},
        "updatedAt" = now() + make_interval(mins => ${attempts})
      WHERE id = ${id}`
    return
  }
  const item = await prisma.importItem.update({
    where: { id },
    data: { state: 'FAILED', error: message },
    select: { originalKey: true },
  })
  await deleteFromOSS(item.originalKey).catch(() => {})
}

/** Fails items whose worker died on every attempt. */
async function failExhausted() {
  const stale = await prisma.importItem.findMany({
    where: { state: 'PROCESSING', attempts: { gte: MAX_ATTEMPTS }, updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    select: { id: true, attempts: true },
  })
  for (const item of stale) await fail(item.id, item.attempts, new Error('Processing stopped part way, every time it was tried'), true)
}

async function runOnce(): Promise<boolean> {
  const item = await claim()
  if (!item) return false
  const started = Date.now()
  try {
    const photoId = await processImportItem(item.id)
    log(`${item.id} -> photo ${photoId} in ${Date.now() - started}ms`)
  } catch (error) {
    const final = error instanceof FinalImportError || item.attempts >= MAX_ATTEMPTS
    log(`${item.id} ${final ? 'failed' : 'will be retried'}:`, error instanceof Error ? error.message : error)
    await fail(item.id, item.attempts, error, final).catch(e => log(`could not record the failure of ${item.id}:`, e))
  }
  return true
}

async function main() {
  const once = process.argv.includes('--once')
  try {
    os.setPriority(19)
  } catch {
    log('could not lower the process priority')
  }
  sharp.concurrency(1)
  sharp.cache(false)
  log('started')

  let stopping = false
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => { stopping = true })
  }
  while (!stopping) {
    let worked = false
    try {
      await failExhausted()
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
