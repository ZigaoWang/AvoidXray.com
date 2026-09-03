/**
 * Clears the bundler's build cache before a build, and nothing else.
 *
 * This replaces `rm -rf .next/cache`, which existed for a good reason: a
 * change to globals.css once shipped to production without its stylesheet,
 * because the incremental cache handed the build an old CSS chunk. The deploy
 * reported success and served the previous styles, and a silent wrong result
 * is worth more than the twenty seconds a cold build costs.
 *
 * What that command also deleted, every single deploy, was
 * `.next/cache/images` — the image optimizer's cache. Nothing about it is
 * build output. Its keys are the source URL, the requested width and the
 * quality; a new build cannot invalidate them, because source images here are
 * content-addressed and never rewritten in place, which is exactly why
 * `minimumCacheTTL` is set to a year in next.config.ts.
 *
 * The two settings were working against each other. scripts/prune-image-cache
 * describes a 2.5GB working set at ~1,000 photos, kept because /_next/image is
 * around 40% of all requests and the optimizer is 2-3x faster than fetching
 * from object storage in Hong Kong. Measured just after a deploy, that cache
 * was 2.6MB. Every deploy was throwing away the whole thing and making the
 * next visitor to each photo pay a full-resolution fetch and re-encode again —
 * on film scans that are routinely 10MB and sometimes 50MB.
 *
 * Everything else under .next/cache still goes.
 */
import { readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const CACHE_DIR = path.join(process.cwd(), '.next', 'cache')

/** Derived from source URLs, not from the build. Survives. */
const KEEP = new Set(['images'])

if (!existsSync(CACHE_DIR)) {
  console.log('[build-cache] nothing to clear')
  process.exit(0)
}

const entries = await readdir(CACHE_DIR)
const removed = []

for (const entry of entries) {
  if (KEEP.has(entry)) continue
  await rm(path.join(CACHE_DIR, entry), { recursive: true, force: true })
  removed.push(entry)
}

const kept = entries.filter((e) => KEEP.has(e))
console.log(
  `[build-cache] cleared ${removed.length ? removed.join(', ') : 'nothing'}` +
    (kept.length ? ` — kept ${kept.join(', ')}` : '')
)
