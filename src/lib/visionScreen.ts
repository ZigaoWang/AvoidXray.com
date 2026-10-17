import sharp from 'sharp'
import { SHARP_INPUT } from '@/lib/sharpConfig'
import { VISION_URL } from '@/lib/vision'

/**
 * The upload's nudity check, kept apart from src/lib/vision.ts because it needs
 * sharp. Search and the photo page import vision.ts, and pulling sharp into
 * them broke the search page in production: the server bundle could not load
 * it from that route.
 */

export interface ScreenResult {
  model: string
  score: number
  hold: boolean
}

/**
 * The nudity check for an upload, before anything is stored.
 *
 * Sends a 640px copy rather than the original, which can be 50MB. Expects
 * HEIC already converted (convertHeicIfNeeded). Null when the worker is
 * unavailable or the image cannot be read:
 * the upload then goes ahead as pending and the worker checks it afterwards,
 * holding it if it is flagged, so a worker outage never blocks uploads.
 */
export async function screenImage(buffer: Buffer): Promise<ScreenResult | null> {
  try {
    // The same decoded-pixel bound as the upload pipeline, so a file built to
    // expand into gigabytes is refused here as it would be there.
    const copy = await sharp(buffer, { ...SHARP_INPUT, failOn: 'none' })
      .rotate()
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer()
    const res = await fetch(`${VISION_URL}/screen`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: new Uint8Array(copy),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as Partial<ScreenResult>
    return typeof body.score === 'number' && typeof body.model === 'string'
      ? { model: body.model, score: body.score, hold: body.hold === true }
      : null
  } catch {
    return null
  }
}
