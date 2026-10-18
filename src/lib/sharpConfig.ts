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
 * libvips threads per operation: the cores shared out over the render slots.
 *
 * This was pinned at 2 for the old 2GB box, then raised to the core count. The
 * setting is process-wide, though, so the core count applied to every render
 * at once: five slots of six threads on six cores. capacity.ts now divides the
 * cores by the slots, so a full house adds up to about the machine.
 */
sharp.concurrency(SHARP_CONCURRENCY)

/**
 * libvips keeps a cache of recent operations. The default reserves 50MB that
 * this machine would rather spend on serving requests, and the workload is
 * one-shot conversions with no repeated inputs to hit in cache anyway.
 */
sharp.cache({ memory: 32, files: 0, items: 50 })

/**
 * JPEG options every encode in the app spreads into its own.
 *
 * libjpeg builds optimal Huffman tables by default, which is a second pass over
 * the whole image to count symbol frequencies before a single byte is written.
 * It is entirely lossless: the coefficients and the quantization are untouched,
 * so the decoded pixels are identical with it and without it, and all it buys
 * is a slightly smaller file.
 *
 * Measured here on a film scan, at the sizes this app emits. sharp spells the
 * option `optimiseCoding`; the American alias is used below.
 *
 *   1080 screen          25ms  ->   16ms   +2.1% bytes
 *   3000 print, 4:4:4   189ms  ->   90ms   +1.0% bytes
 *   62MP screen        1134ms  ->  713ms   +2.1% bytes
 *   62MP print, 4:4:4  1902ms  ->  681ms   +3.9% bytes
 *
 * The encode is the one stage of a render that no number of cores can divide,
 * so it sets the floor under every export and every preview the dialog draws.
 * Roughly halving it is worth a couple of percent of a file.
 *
 * This is the same trade already taken against mozjpeg in watermark/render.ts,
 * settled the same way: there it cost about ten times the time to save 16% of
 * the bytes, and here it costs about twice the time to save two.
 */
export const JPEG_OUTPUT = { optimizeCoding: false } as const

/** True when an error came from the pixel ceiling above rather than bad data. */
export function isTooLarge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /exceeds pixel limit|Input image exceeds/i.test(message)
}
