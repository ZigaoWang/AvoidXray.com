import sharp from 'sharp'
import { SHARP_CONCURRENCY } from './capacity'

/**
 * Process-wide sharp tuning, sized for the box this actually runs on.
 *
 * Import this for its side effects before doing any image work; it is safe to
 * import more than once, as the calls below are idempotent.
 *
 * The thread count comes from src/lib/capacity.ts, which reads the machine.
 * The pixel ceilings below do not. They bound a single decode, and they were
 * chosen against real scans on a 2GB box: the biggest original on record is
 * 7956x7483 at 49.5MB, and left at sharp's defaults one deliberately crafted
 * upload could take the process down. There is more memory now and both of
 * them almost certainly have room to rise, but each cites a peak somebody
 * measured, so they move when somebody measures again and not before.
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
 * Ceiling on a HEIC, which is far lower than the one above and has to be.
 *
 * sharp hands decoding to libvips, which works in tiles and never holds the
 * whole image as one array. A HEIC does not go through sharp: libheif decodes
 * it into a single RGBA buffer in the JavaScript heap, so the peak really is
 * `width * height * 4` bytes all at once — 150 megapixels would be 600MB on a
 * machine with 2GB, before anything is encoded.
 *
 * Fifty megapixels is 200MB at that moment and covers what actually arrives:
 * a phone photograph of a print, which is twelve megapixels on every iPhone
 * shooting HEIC by default and forty-eight at the very top of the range.
 */
export const MAX_HEIC_PIXELS = 50_000_000

/**
 * libvips threads per operation, taken from the core count.
 *
 * This was pinned at 2 on the reasoning that concurrent threads each hold
 * working memory and that on 2GB the limit which binds is memory rather than
 * CPU. That was true of the old box and is not of this one, where the cap had
 * quietly become the thing deciding how long an export took: two threads of
 * six, on the part of the work that parallelizes most cleanly.
 *
 * The note that came with it, that uploads are processed one file per request
 * and so the cap costs little wall clock, argues the other way once memory
 * stops binding. One file at a time is precisely when there is no competing
 * work to protect, and so precisely when a render should have the whole
 * machine.
 */
sharp.concurrency(SHARP_CONCURRENCY)

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
