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
