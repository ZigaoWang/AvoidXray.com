import { decode } from 'blurhash'

/**
 * How many images in a grid get an inline blur placeholder.
 *
 * Each placeholder is a base64 BMP of roughly 1KB that ships inside the HTML,
 * so emitting one per photo does not scale: a camera page with 393 photos was
 * 3.2MB of HTML, 60% of it placeholders for images nobody scrolls to. Images
 * past this cut-off are lazy-loaded and reveal against the container background
 * instead, which is not visible to a user who has to scroll to reach them.
 */
export const BLUR_PLACEHOLDER_COUNT = 12

/**
 * The same budget for the index pages, which lay out cards of four 100px
 * preview tiles rather than a masonry of large images.
 *
 * The card grid is three across at desktop width, so this covers the two rows
 * above the fold. It matters more here than in a masonry: /films was emitting
 * 156 placeholders and /cameras 120, and because base64 does not compress they
 * were 94% of the transferred page — 429KB gzipped, against 25KB for the
 * markup itself. At 100px a tile is also small enough that the placeholder is
 * barely perceptible, so the ones past the fold cost bytes for nothing.
 */
export const CARD_PREVIEW_BLUR_COUNT = 24

/**
 * Placeholder props for a grid image at position `index`.
 *
 * Spread into next/image. Returns an empty placeholder past the cut-off, which
 * also skips the blurhash decode entirely rather than computing a string that
 * gets thrown away.
 */
export function blurPlaceholder(
  blurHash: string | null | undefined,
  index: number,
  limit: number = BLUR_PLACEHOLDER_COUNT
): { placeholder: 'blur' | 'empty'; blurDataURL?: string } {
  if (!blurHash || index >= limit) return { placeholder: 'empty' }

  const blurDataURL = blurHashToDataURL(blurHash)
  return blurDataURL ? { placeholder: 'blur', blurDataURL } : { placeholder: 'empty' }
}

/**
 * Converts a blurhash string to a base64 data URL for use as a placeholder.
 * Uses a small canvas-like approach that works on both server and client.
 *
 * 32x32. A previous version dropped this to 16x16 to save bytes, on the
 * assumption that next/image blurs the placeholder enough to hide the
 * difference. It does not: on a masonry tile several hundred pixels wide the
 * upscale is visibly mushy, and readers reported the grid looking low
 * resolution. The saving was ~36KB on a 500KB page, which is not worth it.
 */
export function blurHashToDataURL(blurHash: string | null | undefined, width = 32, height = 32): string | undefined {
  if (!blurHash) return undefined

  try {
    const pixels = decode(blurHash, width, height)

    // Create BMP format (simpler than PNG, no compression needed)
    const bmp = createBmpDataUrl(pixels, width, height)
    return bmp
  } catch {
    return undefined
  }
}

function createBmpDataUrl(pixels: Uint8ClampedArray, width: number, height: number): string {
  const rowSize = Math.ceil((width * 3) / 4) * 4 // BMP rows are 4-byte aligned
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize // Header (54 bytes) + pixel data

  const buffer = new Uint8Array(fileSize)
  const view = new DataView(buffer.buffer)

  // BMP Header
  buffer[0] = 0x42 // 'B'
  buffer[1] = 0x4D // 'M'
  view.setUint32(2, fileSize, true) // File size
  view.setUint32(10, 54, true) // Pixel data offset

  // DIB Header
  view.setUint32(14, 40, true) // DIB header size
  view.setInt32(18, width, true) // Width
  view.setInt32(22, -height, true) // Height (negative = top-down)
  view.setUint16(26, 1, true) // Color planes
  view.setUint16(28, 24, true) // Bits per pixel
  view.setUint32(30, 0, true) // No compression
  view.setUint32(34, pixelDataSize, true) // Image size

  // Pixel data (BGR format, top to bottom)
  let offset = 54
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      buffer[offset++] = pixels[idx + 2] // B
      buffer[offset++] = pixels[idx + 1] // G
      buffer[offset++] = pixels[idx]     // R
    }
    // Padding to 4-byte boundary
    while (offset % 4 !== 54 % 4 && offset < 54 + (y + 1) * rowSize) {
      buffer[offset++] = 0
    }
    offset = 54 + (y + 1) * rowSize
  }

  // Convert to base64
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }

  return `data:image/bmp;base64,${btoa(binary)}`
}
