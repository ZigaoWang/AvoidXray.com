/**
 * Maps an object key to its Content-Type.
 *
 * Kept separate from lib/oss so scripts can import it without constructing an
 * S3 client as a side effect.
 *
 * Objects written before uploads set this header are stored as
 * application/octet-stream. Browsers sniff past that, but Aliyun's image
 * processing refuses to operate on an object it does not recognize as an image,
 * and caches and proxies cannot make sensible decisions about it either.
 */
const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
}

export function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}
