/**
 * Extract OSS key from full URL
 * Handles various URL formats gracefully using URL API
 *
 * @param url - Full OSS URL (e.g., "https://example.com/path/to/file.webp")
 * @returns OSS key (e.g., "path/to/file.webp") or null if invalid
 */
export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    // Remove leading slash from pathname
    return urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname
  } catch (error) {
    console.error('[OSS] Invalid URL format:', url, error)
    return null
  }
}

/** The public origin objects in our bucket are served from. */
function ossOrigin(): string {
  return `https://${process.env.ALIYUN_OSS_BUCKET}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`
}

/**
 * The key behind a URL, but only if that URL is one this server minted under
 * the given prefix.
 *
 * `extractKeyFromUrl` returns the pathname of whatever it is handed, including
 * a URL on someone else's host. That is fine for reading a key we stored, and
 * dangerous for deciding what to delete: a profile that accepted an arbitrary
 * avatar URL and then deleted the previous value's key could be pointed at
 * `originals/<someone-else's-photo>.jpg` and made to delete it. Anything a
 * caller can name has to be checked against the bucket and the prefix it is
 * allowed to live under before it reaches deleteFromOSS.
 *
 * @param url - The stored or submitted URL
 * @param prefix - The key prefix this value is allowed to be under, e.g. "avatars/"
 * @returns The object key, or null if the URL is not ours or not under the prefix
 */
export function ownedOssKey(url: unknown, prefix: string): string | null {
  if (typeof url !== 'string' || !url) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.origin !== ossOrigin()) return null

  const key = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname
  // Rules out "avatars/../originals/x" and anything else that walks out of the
  // prefix once the storage layer normalizes it.
  if (!key.startsWith(prefix) || key.includes('..')) return null
  return key
}

/**
 * The file extension from an uploaded filename, reduced to something safe to
 * put in a storage key.
 *
 * The raw value was taken straight from `file.name` and interpolated into the
 * object key, so a name like "photo.jp/../../x" produced a key with path
 * separators in it. Anything that is not a short run of letters and digits
 * falls back to jpg — the extension only labels the stored original, so a
 * conservative default costs nothing.
 *
 * @param filename - The uploaded file's name
 * @returns A lowercase alphanumeric extension
 */
export function safeExtension(filename: string): string {
  const candidate = filename.split('.').pop()?.toLowerCase() ?? ''
  return /^[a-z0-9]{1,5}$/.test(candidate) ? candidate : 'jpg'
}

/**
 * Generate OSS key for item image
 *
 * @param type - Resource type ('camera' or 'filmstock')
 * @param id - Resource ID
 * @returns OSS key path (e.g., "cameras/abc123-1234567890.webp")
 */
export function generateImageKey(type: 'camera' | 'filmstock', id: string): string {
  const timestamp = Date.now()
  const folder = type === 'camera' ? 'cameras' : 'filmstocks'
  return `${folder}/${id}-${timestamp}.webp`
}
