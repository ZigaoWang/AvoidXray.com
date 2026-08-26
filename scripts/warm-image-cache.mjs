/**
 * Pre-renders the image variants the grids ask for, so readers do not pay for
 * the first request.
 *
 * A cold /_next/image costs a 1.3s round trip to object storage in Hong Kong
 * plus the encode; warm it is under 0.1s from local disk. That gap is the whole
 * reason the optimizer's cache is worth keeping, and it means anything that
 * empties the cache — an over-tight prune, or photos being re-uploaded under
 * new keys — is felt directly as a slow site until readers happen to warm it
 * again one image at a time.
 *
 * Run this after anything that invalidates cache entries in bulk. It only
 * issues ordinary GETs against the running server, so it is safe at any time;
 * the cost is CPU that would otherwise have been spent on the reader's request.
 *
 *   node scripts/warm-image-cache.mjs --dry-run
 *   node scripts/warm-image-cache.mjs --concurrency=3
 *   node scripts/warm-image-cache.mjs --since=2026-08-01   # only recent photos
 */
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

/**
 * Widths worth warming.
 *
 * Next picks from its deviceSizes/imageSizes for each `sizes` attribute; these
 * are the ones the masonry grids and preview tiles actually resolve to across
 * common viewports and pixel ratios. Warming every possible width would
 * multiply the work for variants nobody requests.
 */
const GRID_WIDTHS = [640, 828, 1080]
const TILE_WIDTHS = [256, 384]

/** Matches next/image's default quality, so the URLs are the ones it caches. */
const QUALITY = 75

/**
 * Concurrent requests.
 *
 * The box has three cores and 2GB, and it is serving readers at the same time.
 * Three keeps the optimizer busy without starving anything else.
 */
const DEFAULT_CONCURRENCY = 3

function arg(name, fallback = null) {
  const found = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : fallback
}

async function main() {
  const base = arg('base', 'http://127.0.0.1:3000')
  const dryRun = process.argv.includes('--dry-run')
  const concurrency = Number(arg('concurrency', String(DEFAULT_CONCURRENCY))) || DEFAULT_CONCURRENCY
  const since = arg('since')

  const prisma = new PrismaClient()
  const where = {
    published: true,
    visibility: 'PUBLIC',
    ...(since ? { updatedAt: { gte: new Date(since) } } : {}),
  }

  const photos = await prisma.photo.findMany({
    where,
    select: { id: true, mediumPath: true, thumbnailPath: true },
    // Newest first: the pages people open are ordered this way, so the warming
    // that matters most happens first and an interrupted run still helps.
    orderBy: { createdAt: 'desc' },
  })
  await prisma.$disconnect()

  const jobs = []
  for (const photo of photos) {
    for (const w of GRID_WIDTHS) {
      if (photo.mediumPath) jobs.push({ url: photo.mediumPath, w })
    }
    for (const w of TILE_WIDTHS) {
      if (photo.thumbnailPath) jobs.push({ url: photo.thumbnailPath, w })
    }
  }

  console.log(`[warm] ${photos.length} photos -> ${jobs.length} variants, concurrency ${concurrency}`)
  if (dryRun) {
    console.log('[warm] dry run; nothing requested')
    return
  }

  let done = 0
  let failed = 0
  let cached = 0
  let next = 0
  const started = Date.now()

  async function worker() {
    while (true) {
      const i = next++
      if (i >= jobs.length) return
      const job = jobs[i]
      const target = `${base}/_next/image?url=${encodeURIComponent(job.url)}&w=${job.w}&q=${QUALITY}`
      try {
        const res = await fetch(target)
        // Body must be drained or the connection is held open and the pool stalls.
        await res.arrayBuffer()
        if (!res.ok) failed++
        else if (res.headers.get('x-nextjs-cache') === 'HIT') cached++
      } catch {
        failed++
      }
      done++
      if (done % 250 === 0) {
        const rate = done / ((Date.now() - started) / 1000)
        const left = Math.round((jobs.length - done) / rate)
        console.log(`[warm] ${done}/${jobs.length}  ${rate.toFixed(1)}/s  ~${Math.floor(left / 60)}m left  (${failed} failed)`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))

  const elapsed = Math.round((Date.now() - started) / 1000)
  console.log(`[warm] done: ${done} requested, ${cached} already cached, ${failed} failed, ${elapsed}s`)
}

main().catch((error) => {
  console.error('[warm] failed:', error)
  process.exit(1)
})
