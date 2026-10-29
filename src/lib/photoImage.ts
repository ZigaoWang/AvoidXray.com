import type { ImageLoader } from 'next/image'

/**
 * Photos are served as stored, never through the image optimizer.
 *
 * The optimizer re-encodes at its own quality and drops the color profile
 * every stored version carries, and it keeps what it made for a year under the
 * photo's address. A photo made private moves to new keys, but a copy kept by
 * the optimizer would still answer under the old one, so photo files are not
 * given to it at all (next.config.ts allows only catalog images and avatars).
 *
 * A grid still wants a responsive choice, so this picks among the stored
 * sizes by the width the browser asks for: the thumb up to its own width, the
 * medium beyond. Client components only; a function cannot be passed from a
 * server component, which serves the thumb with `unoptimized` instead.
 */
export function storedVersionLoader(photo: { thumbnailPath: string; mediumPath?: string | null }): ImageLoader {
  return ({ width }) => (width <= THUMB_WIDTH || !photo.mediumPath ? photo.thumbnailPath : photo.mediumPath)
}

/** The thumb's long edge, set in src/lib/image.ts. */
const THUMB_WIDTH = 800
