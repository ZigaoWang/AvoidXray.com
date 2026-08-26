import sharp from 'sharp'

/**
 * Process-wide sharp tuning, sized for the box this actually runs on.
 *
 * Import this for its side effects before doing any image work; it is safe to
 * import more than once, as the calls below are idempotent.
 *
 * The server is a 3-core, 2GB machine, and film scans are the largest things
 * it handles — the biggest original on record is 7956x7483 at 49.5MB. Left at
 * sharp's defaults, one deliberately crafted upload could take the process
 * down, and the app has no memory headroom to absorb that.
 */

/**
 * Ceiling on decoded image size.
 *
 * This, not the file size, is the guard that matters. A file-size limit is a
 * poor proxy for memory: a 2MB PNG can decode to 20000x20000, which is 400
 * megapixels and hundreds of megabytes, while a 50MB JPEG from a scanner is
 * comparatively modest. sharp's default allows ~268MP, which this machine
 * cannot survive.
 *
 * Set well clear of real work — the largest image the site has ever stored is
 * under 60MP — so this only ever rejects something pathological.
 */
export const MAX_INPUT_PIXELS = 150_000_000

/** Input options for every `sharp()` call that touches an uploaded file. */
export const SHARP_INPUT = { limitInputPixels: MAX_INPUT_PIXELS } as const

/**
 * libvips threads per operation. Defaults to the core count; capped here
 * because concurrent threads each hold working memory, and on 2GB the limit
 * that binds is memory rather than CPU. Uploads are already processed one file
 * per request, so this costs very little wall-clock.
 */
sharp.concurrency(2)

/**
 * libvips keeps a cache of recent operations. The default reserves 50MB that
 * this machine would rather spend on serving requests, and the workload is
 * one-shot conversions with no repeated inputs to hit in cache anyway.
 */
sharp.cache({ memory: 32, files: 0, items: 50 })

/** True when an error came from the pixel ceiling above rather than bad data. */
export function isTooLarge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /exceeds pixel limit|Input image exceeds/i.test(message)
}
