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

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { displayName } from '@/lib/seo/alt'
import { readFromOSS } from '@/lib/oss'
import { filmTypeLabel } from '@/lib/filmFields'
import { RENDER_SLOTS, SOURCE_CACHE_BYTES } from '@/lib/capacity'

/**
 * What the catalog knows about a photograph, in the shape a renderer wants.
 *
 * Two routes composite now, and this mapping is where the interesting mistakes
 * live: the camera has to come through displayName or an export says "F4" while
 * the page beside it says "Nikon F4"; the film's brand has to be brand and name
 * joined or a Lomography strip gets Kodak's ink; the stock's gauge column lists
 * what it is *sold* in rather than the frame this picture came from. Writing
 * that twice is how the second copy ends up subtly wrong.
 */
export function catalogFacts(photo: {
  camera: unknown
  filmStock: { format?: unknown; iso?: number | null; brand?: string | null; name?: string | null; chromaticity?: string | null; polarity?: string | null } | null
  takenDate?: Date | string | null
  /** Null only on an archive photo, which canViewPhoto keeps out of exports. */
  user: { username: string } | null
}) {
  const film = photo.filmStock
  return {
    filmFormat: (Array.isArray(film?.format) ? film?.format[0] : film?.format) as string || '35mm',
    filmKind: (film ? filmTypeLabel(film.chromaticity as never, film.polarity as never) : null) || '',
    stock: {
      iso: film?.iso ?? null,
      // Brand and name together, because the brand column is empty for a good
      // part of the catalog while the name almost always leads with the maker —
      // "Kodak Gold 200", "LomoChrome Color '92".
      brand: [film?.brand, film?.name].filter(Boolean).join(' '),
      monochrome: film?.chromaticity === 'MONOCHROME',
    },
    camera: displayName(photo.camera as never) || '',
    film: displayName(film as never) || '',
    username: photo.user?.username ?? '',
    /** The photograph's own date, never the row's createdAt. */
    date: photo.takenDate
      ? new Date(photo.takenDate).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
        })
      : '',
  }
}

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
 * stored here differ by an order of magnitude, a medium being a few hundred
 * kilobytes against an original averaging 8.9MB, and a count would let a
 * handful of originals take far more of the machine than this is worth.
 *
 * The budget comes from src/lib/capacity.ts. It was 48MB, sized for a 2GB box,
 * and that number had stopped doing its job twice over: average originals
 * evicted each other between one click and the next, and the eligibility test
 * below is `size <= limit`, so the largest original on the site at 51.8MB sat
 * over the entire budget and was never cached even once. Measured against the
 * bucket, that file costs 4.2 to 6.0 seconds to fetch, against 0.74s to render
 * it. The most expensive fetch on the site was the one guaranteed to repeat.
 *
 * In-process, so it is correct only while this runs as a single pm2 fork. That
 * is already true of the rate limiter in src/lib/rateLimit.ts, and the failure
 * mode here is a cache miss rather than a wrong answer.
 */
const SOURCE_CACHE_LIMIT = SOURCE_CACHE_BYTES
const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000

const sourceCache = new Map<string, { buffer: Buffer; at: number }>()
let sourceCacheBytes = 0

function drop(url: string) {
  const held = sourceCache.get(url)
  if (!held) return
  sourceCache.delete(url)
  sourceCacheBytes -= held.buffer.byteLength
}

/**
 * The local mirror of the bucket, when there is one.
 *
 * The bucket is in Hong Kong and this box is in Los Angeles. Measured against
 * it: 0.7 to 0.9s before the first byte, and 4.2 to 6.0s to pull the largest
 * original on the site, against 0.74s to render it once it arrives. The network
 * was roughly eight times the compute.
 *
 * Note what this is not. Visitors do not fetch from the bucket: every image on
 * the site goes through next/image, which is served from this server. This is
 * the server's own fetch, on the export path, where somebody is watching a
 * dialog while it happens.
 *
 * Populated by /usr/local/bin/avoidxray-media-sync. Absent on a laptop and
 * absent for any object added since the last sync, so a miss falls through to
 * the bucket rather than failing: the mirror is an optimization, and the
 * authoritative copy is still the one in Aliyun.
 */
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/var/lib/avoidxray/media'

async function readMirrored(key: string): Promise<Buffer | null> {
  // The key comes from the database rather than from a request, so this is a
  // belt-and-braces check; it costs nothing and the failure it prevents is
  // reading an arbitrary file off the disk.
  // Ignored for tracing: the mirror lives outside the app, and without the
  // comment the bundler copied the whole project into the server output.
  const full = path.resolve(/*turbopackIgnore: true*/ MEDIA_ROOT, key)
  if (!full.startsWith(path.resolve(/*turbopackIgnore: true*/ MEDIA_ROOT) + path.sep)) return null

  try {
    return await readFile(/*turbopackIgnore: true*/ full)
  } catch {
    return null
  }
}

/**
 * A stored photo file by its key, private or public: from the cache, the
 * mirror, or the bucket with the site's own credentials. Never by URL, since a
 * private file has no address that works without a signature.
 */
export async function fetchImage(key: string): Promise<Buffer> {
  const held = sourceCache.get(key)
  if (held) {
    if (Date.now() - held.at <= SOURCE_CACHE_TTL_MS) {
      // Re-inserted so Map iteration order stays least-recently-used first,
      // which is the order eviction below walks.
      sourceCache.delete(key)
      sourceCache.set(key, held)
      return held.buffer
    }
    drop(key)
  }

  const mirrored = await readMirrored(key)
  if (mirrored) {
    remember(key, mirrored)
    return mirrored
  }

  const buffer = await readFromOSS(key)
  remember(key, buffer)

  return buffer
}

/** Hold a fetched source, evicting least-recently-used entries to stay in budget. */
function remember(url: string, buffer: Buffer) {
  if (buffer.byteLength > SOURCE_CACHE_LIMIT) return

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

/**
 * How many exports may be composited at once, and how many may wait.
 *
 * The rate limit in src/lib/rateLimitPolicy.ts is a rate, not a bound on what
 * is in flight: an allowance of N in five minutes permits N at the same
 * instant. That was survivable while every export was a 1080px canvas. It is
 * not now that a caller can ask for three times that in each direction.
 * Measured by sampling RSS through a real render, one sprocket export at the
 * largest size peaks around 560MB above its baseline against 36MB at the
 * smallest, which is why the source fetch happens inside the slot rather than
 * before it.
 *
 * The count comes from src/lib/capacity.ts, which leaves one core for the rest
 * of the site: it still has pages to serve while somebody is exporting. That
 * was already the reasoning behind two slots on three cores, but it was written
 * down as a literal 2, so it stayed at 2 when the box grew and four of six
 * cores sat out every export.
 *
 * What is deliberately not derived is HEAVY_MEGAPIXELS below, and the exclusive
 * rule it feeds. Those bound memory rather than cores, and they rest on peaks
 * measured against the old box. Past the queue the honest answer is still 503
 * with a Retry-After rather than accepting work that will either take minutes
 * or take the process down with it.
 */
export const RENDER_QUEUE_LIMIT = 8

let rendersInFlight = 0

type Waiter = {
  wanted: number
  exclusive: boolean
  background: boolean
  admit: () => void
}

/** Parked callers, oldest first. */
const waitingForSlot: Waiter[] = []

export class Saturated extends Error {}

/** The caller went away before the work began. Not an error to report. */
export class Abandoned extends Error {}

/**
 * Past this, a render holds the whole machine rather than half of it.
 *
 * Measured on real scans: a gallery print at the photograph's own resolution
 * runs to 61-64 megapixels for the largest frames here and peaks around 1.2GB
 * of resident memory. Two at once was more than the original 2GB box with
 * Postgres on it had, and the point of a size called "Full" is that it is not
 * capped -- so the bound moves from the size of the render to how many of them
 * run together. On the 8GB box two would fit; this is conservative there, not
 * necessary, and is the number to measure before raising throughput.
 */
export const HEAVY_MEGAPIXELS = 24

/**
 * Heavy callers currently parked, so light ones can be told to wait for them.
 *
 * Without this a large export is starved for as long as anybody is using the
 * dialog. A heavy render needs every slot, so it parks; a light caller only
 * needs one, so without a rule it takes each slot as it frees while the heavy
 * one is still looking for all of them. A preview lands
 * every few hundred milliseconds and a contact sheet on every dialog opened, so
 * the pair of slots is never both free at the same instant and the download
 * waits behind an unbounded stream of work that arrived after it.
 *
 * Counted from the queue rather than kept as a running total, so it cannot
 * drift from what is actually parked.
 */
const heavyWaiting = () => waitingForSlot.filter(w => w.exclusive && !w.background).length

/**
 * Callers somebody is actually waiting on, so bulk work can stand aside.
 *
 * A batch export is one request a frame for minutes at a time, and at full
 * resolution every one of those frames is heavy: it takes every slot, so for
 * the length of the batch nothing else on the site can composite at all.
 * Somebody opening a photograph while that runs would wait behind a queue of
 * work they cannot see and did not ask for.
 *
 * So a batch renders as background: it never counts as heavy waiting, which is
 * what makes interactive work yield, and it stands aside for anyone already in
 * the queue. The cost is that constant foreground traffic could hold a batch
 * off indefinitely. That is the right way round — the person watching a
 * progress bar should lose to the person waiting on a page — and it stays
 * theoretical here, because the only things that composite are the export
 * dialog's own previews and its contact sheet, which nobody is opening while
 * their own batch runs.
 */
const foregroundWaiting = () => waitingForSlot.filter(w => !w.background).length

/**
 * Whether a caller has to wait: not enough slots free, or light work facing a
 * heavy render already queued, or bulk work facing anyone already queued.
 */
function blocked(caller: { wanted: number; exclusive: boolean; background: boolean }): boolean {
  return rendersInFlight + caller.wanted > RENDER_SLOTS
    || (!caller.exclusive && heavyWaiting() > 0)
    || (caller.background && foregroundWaiting() > 0)
}

/**
 * Hands freed slots to parked callers, oldest first among those allowed.
 *
 * The slots are counted out to a waiter here, at the moment it is chosen,
 * rather than released for it to come and take. It used to be the second: a
 * release woke every waiter and emptied the queue, and each woken caller then
 * re-checked for itself. Until they ran, the queue looked empty, so a request
 * arriving in that gap took the slot ahead of callers parked since before it
 * existed; the losers queued again behind it, past RENDER_QUEUE_LIMIT, since
 * the limit had counted them out. Now a slot is never free while somebody
 * eligible is waiting for it, and the queue is only ever as long as the limit.
 */
function admitWaiting() {
  for (let i = 0; i < waitingForSlot.length; ) {
    const waiter = waitingForSlot[i]
    // Judged with the waiter still in the queue. That counts it among the
    // heavy or foreground callers, but no rule asks a caller to yield to its
    // own kind: only light work yields to heavy, and only bulk to foreground.
    if (blocked(waiter)) {
      i++
      continue
    }
    waitingForSlot.splice(i, 1)
    rendersInFlight += waiter.wanted
    waiter.admit()
    // From the front again: removing a heavy or foreground waiter can unblock
    // one that was passed over earlier in this loop.
    i = 0
  }
}

export async function withRenderSlot<T>(
  exclusive: boolean,
  work: () => Promise<T>,
  /** Bulk work nobody is watching frame by frame. Yields to everything else. */
  background = false,
): Promise<T> {
  // A heavy render takes every slot, so nothing else composites beside it.
  const caller = { wanted: exclusive ? RENDER_SLOTS : 1, exclusive, background }

  // Straight in only when nobody is queued: a newcomer never overtakes a
  // waiter, even one that is blocked only by a rule that would let the
  // newcomer through.
  if (waitingForSlot.length === 0 && !blocked(caller)) {
    rendersInFlight += caller.wanted
  } else {
    if (waitingForSlot.length >= RENDER_QUEUE_LIMIT) throw new Saturated()
    await new Promise<void>(admit => {
      waitingForSlot.push({ ...caller, admit })
      // A foreground arrival can be admitted at once when only bulk work is
      // queued and slots are free; nothing else would look at it until the
      // next release.
      admitWaiting()
    })
  }

  try {
    return await work()
  } finally {
    rendersInFlight -= caller.wanted
    admitWaiting()
  }
}

