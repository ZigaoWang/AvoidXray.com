import sharp from 'sharp'

/**
 * Process item image (camera or filmstock) with standardized pipeline
 * - Trims transparent edges
 * - Adds 40px padding
 * - Resizes to max 1200x1200 (maintaining aspect ratio)
 * - Converts to WebP format
 *
 * @param buffer - Raw image buffer
 * @returns Processed image buffer in WebP format
 */
export async function processItemImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: 10
    })
    .extend({
      top: 40,
      bottom: 40,
      left: 40,
      right: 40,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .resize(1200, 1200, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 90 })
    .toBuffer()
}
