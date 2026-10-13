/**
 * Downscaled previews for the upload grid.
 *
 * The grid used to point an <img> straight at an object URL for the original
 * file. The tiles are about 96px across, but the browser still decodes the
 * full image to paint one: thirty 24MP photos is roughly 2.7GB of decoded
 * bitmap, which is what made the page — and every control on it — stall.
 *
 * These previews are for display only. The original File is what gets
 * uploaded, untouched, at full quality.
 */

/**
 * Longest edge of a preview. Tiles render around 96px, so this still has
 * headroom for a high-DPI screen without keeping anything large around.
 */
export const PREVIEW_MAX_EDGE = 384

/**
 * How many files to decode at once.
 *
 * Previews used to be built with Promise.all over the whole drop, so fifty
 * files meant fifty simultaneous full-resolution decodes before a single one
 * was released. A small window keeps peak memory flat no matter how many
 * photos are dropped.
 */
const DECODE_CONCURRENCY = 4

export function isHeic(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  )
}

/** HEIC is not paintable in most browsers, so it is converted first. */
async function toPaintableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file
  const heic2any = (await import('heic2any')).default
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 })
  return Array.isArray(converted) ? converted[0] : converted
}

async function downscale(blob: Blob): Promise<string> {
  // from-image honours the EXIF orientation tag, so portrait photos are not
  // shown on their side.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= PREVIEW_MAX_EDGE) return URL.createObjectURL(blob)

    const scale = PREVIEW_MAX_EDGE / longest
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.82)
    )
    if (!out) throw new Error('toBlob returned nothing')
    return URL.createObjectURL(out)
  } finally {
    // Frees the decoded pixels immediately rather than waiting for GC.
    bitmap.close()
  }
}

/** A preview URL for one file. Falls back to the original if anything fails. */
export async function createPreviewUrl(file: File): Promise<string> {
  let paintable: Blob
  try {
    paintable = await toPaintableBlob(file)
  } catch {
    // A HEIC we could not convert will not render, but the upload still works
    // and the tile shows the broken-image state rather than disappearing.
    return URL.createObjectURL(file)
  }

  try {
    return await downscale(paintable)
  } catch {
    return URL.createObjectURL(paintable)
  }
}

/**
 * Previews for a batch, in order, decoding a few at a time.
 * `onReady` fires as each one lands so tiles can appear progressively.
 */
export async function createPreviewUrls(
  files: File[],
  onReady?: (index: number, url: string) => void
): Promise<string[]> {
  const urls = new Array<string>(files.length)
  let next = 0

  async function worker() {
    while (true) {
      const i = next++
      if (i >= files.length) return
      const url = await createPreviewUrl(files[i])
      urls[i] = url
      onReady?.(i, url)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DECODE_CONCURRENCY, files.length) }, worker)
  )
  return urls
}
