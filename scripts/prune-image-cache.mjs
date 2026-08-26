/**
 * Keeps Next's image-optimizer cache under a size budget.
 *
 * Why this exists: /_next/image is around 40% of all requests, and the
 * optimizer is worth keeping — measured against fetching resized images from
 * OSS directly it is 2-3x faster, because the server is in Los Angeles and the
 * bucket is in Hong Kong. The local cache is effectively acting as a US edge.
 *
 * The problem is that it only grows. Source images are content-addressed and
 * never rewritten, minimumCacheTTL is a year, and Next never evicts. At 1,037
 * photos the cache is 2.5GB; the same ratio at ten thousand photos would fill
 * the 39GB volume this shares with the database and the application itself.
 *
 * Eviction is safe: every entry is derived data that regenerates on the next
 * request for that URL. The only cost of deleting too much is some re-encoding.
 * Least-recently-modified goes first, which approximates least-recently-used —
 * Next rewrites an entry when it revalidates, so an image nobody loads is an
 * image whose entry stops being touched.
 *
 *   node scripts/prune-image-cache.mjs --dry-run
 *   node scripts/prune-image-cache.mjs --budget-mb=1500
 *
 * Suggested cron (daily, quiet hours):
 *   17 4 * * * cd /www/wwwroot/avoidxray.com && /usr/bin/node scripts/prune-image-cache.mjs >> /var/log/avoidxray-image-prune.log 2>&1
 */
import { readdir, stat, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const CACHE_DIR = path.join(process.cwd(), '.next', 'cache', 'images')

/**
 * How much disk the cache may keep.
 *
 * Sized above the whole working set rather than below it. The entire cache for
 * ~1,000 photos measured 2.3GB, so an earlier 1.5GB budget did not cap growth
 * so much as guarantee eviction of entries people were still looking at — and
 * every eviction costs a 1.3s round trip to object storage in Hong Kong the
 * next time that image is requested. Headroom is cheap here: the volume has
 * 13GB free. This is a backstop against unbounded growth, not a target.
 */
const DEFAULT_BUDGET_MB = 4000

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run')
  const budgetArg = argv.find((a) => a.startsWith('--budget-mb='))
  const budgetMb = budgetArg ? Number(budgetArg.split('=')[1]) : DEFAULT_BUDGET_MB

  if (!Number.isFinite(budgetMb) || budgetMb <= 0) {
    throw new Error(`--budget-mb must be a positive number, got "${budgetArg}"`)
  }
  return { dryRun, budgetBytes: budgetMb * 1024 * 1024, budgetMb }
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/**
 * One cache entry per directory. Size is the sum of the files inside it, and
 * recency is the newest mtime among them.
 */
async function measureEntry(name) {
  const dir = path.join(CACHE_DIR, name)
  let bytes = 0
  let touchedAt = 0

  const files = await readdir(dir).catch(() => null)
  // Raced with Next writing or removing it; skip rather than fail the run.
  if (!files) return null

  for (const file of files) {
    const info = await stat(path.join(dir, file)).catch(() => null)
    if (!info) continue
    bytes += info.size
    touchedAt = Math.max(touchedAt, info.mtimeMs)
  }

  return { dir, bytes, touchedAt }
}

async function main() {
  const { dryRun, budgetBytes, budgetMb } = parseArgs(process.argv.slice(2))

  if (!existsSync(CACHE_DIR)) {
    console.log(`[prune] no cache at ${CACHE_DIR}; nothing to do`)
    return
  }

  const names = await readdir(CACHE_DIR)
  const entries = (await Promise.all(names.map(measureEntry))).filter(Boolean)
  const total = entries.reduce((sum, e) => sum + e.bytes, 0)

  console.log(`[prune] ${entries.length} entries, ${formatMb(total)} used, budget ${budgetMb}MB`)

  if (total <= budgetBytes) {
    console.log('[prune] under budget; nothing to do')
    return
  }

  // Oldest first, deleting until the total fits.
  entries.sort((a, b) => a.touchedAt - b.touchedAt)

  let freed = 0
  let removed = 0
  for (const entry of entries) {
    if (total - freed <= budgetBytes) break
    if (!dryRun) {
      await rm(entry.dir, { recursive: true, force: true }).catch((error) => {
        console.error(`[prune] could not remove ${entry.dir}:`, error.message)
      })
    }
    freed += entry.bytes
    removed++
  }

  const verb = dryRun ? 'would remove' : 'removed'
  console.log(`[prune] ${verb} ${removed} entries, freeing ${formatMb(freed)}`)
  console.log(`[prune] cache now ${formatMb(total - freed)}`)
}

main().catch((error) => {
  console.error('[prune] failed:', error)
  process.exit(1)
})
