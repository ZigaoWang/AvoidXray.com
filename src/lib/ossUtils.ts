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
