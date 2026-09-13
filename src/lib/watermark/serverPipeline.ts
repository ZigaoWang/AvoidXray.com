/**
 * The two resources every export shares: the source bytes and the right to
 * composite.
 *
 * Both of these were private to src/app/api/watermark/route.ts, which was
 * correct while that route was the only thing that rendered. It is not: the
 * contact sheet behind the dialog's look tiles renders five treatments of one
 * photograph, and a second copy of either of these would be worse than useless
 * — a second cache would hold the same originals twice on a box with 2GB, and a
 * second semaphore would let four heavy renders run while each half believed it
 * was allowing two.
 *
 * Server only. It holds Buffers and reaches storage.
 */

/**
 * Sources already fetched, held briefly in memory.
 *
 * The dialog renders a preview per option change, and each one re-fetched the
 * same object from storage: measured from the app server, 1.10s for a 278KB
 * medium, repeatable, with 0.70s of that time to first byte. The bucket is in
 * Hong Kong and this box is not. That single fetch cost roughly four times the
 * whole render, so the interaction was spending its time on bytes it had
 * already seen rather than on anything it was doing.
 *
 * Bounded by total bytes rather than by entry count, because the two things
 * stored here differ by an order of magnitude — a medium is a few hundred
 * kilobytes and an original averages 8.9MB — and a count would let a handful of
 * originals take far more of a 2GB machine than this is worth.
 *
 * In-process, so it is correct only while this runs as a single pm2 fork. That
 * is already true of the rate limiter in src/lib/rateLimit.ts, and the failure
 * mode here is a cache miss rather than a wrong answer.
 */
const SOURCE_CACHE_LIMIT = 48 * 1024 * 1024
const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000

const sourceCache = new Map<string, { buffer: Buffer; at: number }>()
let sourceCacheBytes = 0

function drop(url: string) {
  const held = sourceCache.get(url)
  if (!held) return
  sourceCache.delete(url)
  sourceCacheBytes -= held.buffer.byteLength
}

export async function fetchImage(url: string): Promise<Buffer> {
  const held = sourceCache.get(url)
  if (held) {
    if (Date.now() - held.at <= SOURCE_CACHE_TTL_MS) {
      // Re-inserted so Map iteration order stays least-recently-used first,
      // which is the order eviction below walks.
      sourceCache.delete(url)
      sourceCache.set(url, held)
      return held.buffer
    }
    drop(url)
  }

  // Storage is far enough away that a stalled connection would otherwise hold
  // the request open indefinitely; ogCard.tsx takes the same precaution. Set
  // well clear of a real fetch rather than close to it: the largest original on
  // the site is 47MB and the bucket serves 6-7MB/s measured, so a fast one is
  // already seven seconds and a slow moment must not read as a broken export.
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  if (buffer.byteLength <= SOURCE_CACHE_LIMIT) {
    // Dropped first: two requests can miss on the same url at once, and
    // overwriting the entry without this would count its bytes twice.
    drop(url)
    sourceCache.set(url, { buffer, at: Date.now() })
    sourceCacheBytes += buffer.byteLength
    for (const oldest of sourceCache.keys()) {
      if (sourceCacheBytes <= SOURCE_CACHE_LIMIT) break
      if (oldest !== url) drop(oldest)
    }
  }

  return buffer
}

/**
 * How many exports may be composited at once, and how many may wait.
 *
 * The rate limit in src/lib/rateLimitPolicy.ts is a rate, not a bound on what
 * is in flight: an allowance of N in five minutes permits N at the same
 * instant. That was survivable while every export was a 1080px canvas. It is
 * not now that a caller can ask for three times that in each direction —
 * measured by sampling RSS through a real render, one sprocket export at the
 * largest size peaks around 560MB above its baseline against 36MB at the
 * smallest, and this box has 2GB with Postgres beside it and, in
 * sharpConfig.ts's own words, "no memory headroom to absorb" a large decode.
 * Two of those at once is most of the machine, which is why it is two and not
 * more, and why the source fetch happens inside the slot rather than before.
 *
 * Two slots on three cores leaves one for the rest of the site, which still has
 * pages to serve while somebody is exporting. Past the queue the honest answer
 * is 503 with a Retry-After rather than accepting work that will either take
 * minutes or take the process down with it.
 */
const RENDER_SLOTS = 2
const RENDER_QUEUE_LIMIT = 8

let rendersInFlight = 0
const waitingForSlot: (() => void)[] = []

export class Saturated extends Error {}

/** The caller went away before the work began. Not an error to report. */
export class Abandoned extends Error {}

/**
 * Past this, a render holds the whole machine rather than half of it.
 *
 * Measured on real scans: a gallery print at the photograph's own resolution
 * runs to 61-64 megapixels for the largest frames here and peaks around 1.2GB
 * of resident memory. Two at once is more than a 2GB box with Postgres on it
 * has, and the point of a size called "Full" is that it is not capped -- so the
 * bound moves from the size of the render to how many of them run together.
 */
export const HEAVY_MEGAPIXELS = 24

export async function withRenderSlot<T>(exclusive: boolean, work: () => Promise<T>): Promise<T> {
  // The slot is handed from one holder straight to the next, rather than
  // released for whoever happens to be running.
  //
  // Decrementing and then waking a waiter leaves a gap: a request arriving in
  // that moment finds a free slot and takes it, so it overtakes callers that
  // have been parked since before it existed, and a woken waiter that loses
  // that race has to queue again — past the queue limit, since it is already
  // counted out of it. Transferring the count with the turn removes the gap
  // entirely, and makes the queue what it claims to be: first come, first
  // served, with a real bound on its length.
  // A heavy render takes every slot, so nothing else composites beside it.
  const wanted = exclusive ? RENDER_SLOTS : 1

  const free = rendersInFlight + wanted <= RENDER_SLOTS && waitingForSlot.length === 0
  if (!free) {
    if (waitingForSlot.length >= RENDER_QUEUE_LIMIT) throw new Saturated()
    // Woken by a holder releasing; the count is not transferred for a heavy
    // caller, since it needs more than the one turn being handed over, so it
    // re-checks and waits again until the machine is genuinely clear.
    while (rendersInFlight + wanted > RENDER_SLOTS) {
      await new Promise<void>(resolve => waitingForSlot.push(resolve))
    }
  }
  rendersInFlight += wanted

  try {
    return await work()
  } finally {
    rendersInFlight -= wanted
    // Everyone waiting gets a look, because what just freed up may be enough
    // for a light caller and not for a heavy one.
    for (const waiter of waitingForSlot.splice(0)) waiter()
  }
}
