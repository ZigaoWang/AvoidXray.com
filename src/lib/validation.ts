/**
 * Sanitize and trim string input
 * @param str - Input string or null
 * @returns Trimmed string or null if empty
 */
export function sanitizeString(str: string | null): string | null {
  if (!str) return null
  const trimmed = str.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Validate year is within acceptable range
 * @param year - Year as string or number
 * @returns True if year is between 1800 and current year
 */
export function validateYear(year: string | number): boolean {
  const yearNum = typeof year === 'string' ? parseInt(year) : year
  return !isNaN(yearNum) && yearNum >= 1800 && yearNum <= new Date().getFullYear()
}

/**
 * Validate ISO value for film stocks
 * @param iso - ISO value as string or number
 * @returns True if ISO is between 1 and 100000
 */
export function validateISO(iso: string | number): boolean {
  const isoNum = typeof iso === 'string' ? parseInt(iso) : iso
  return !isNaN(isoNum) && isoNum >= 1 && isoNum <= 100000
}

/**
 * Validate file size
 * @param size - File size in bytes
 * @param maxMB - Maximum size in megabytes
 * @returns True if file is within size limit
 */
export function validateFileSize(size: number, maxMB: number): boolean {
  return size <= maxMB * 1024 * 1024
}

/**
 * Validate image file type
 * @param mimeType - MIME type string
 * @returns True if file is an image
 */
export function validateImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * Validate field length
 * @param str - String to validate
 * @param maxLength - Maximum allowed length
 * @returns True if string is within length limit
 */
export function validateFieldLength(str: string, maxLength: number): boolean {
  return str.length <= maxLength
}

/**
 * A query-string integer, clamped into a range it is safe to hand to Prisma.
 *
 * `parseInt` on absent or non-numeric input yields NaN, which reached `skip`
 * and `take` as-is and surfaced as a 500 — so `?offset=abc` was an error page
 * rather than the first page. Negative offsets and unbounded limits failed the
 * same way, or turned one request into an arbitrarily expensive query.
 *
 * @param raw - The raw query-string value, if present
 * @param options - Fallback for missing or unusable input, and the bounds
 * @returns An integer within [min, max]
 */
export function parseIntParam(
  raw: string | null,
  { fallback, min = 0, max }: { fallback: number; min?: number; max: number }
): number {
  const parsed = Number(raw)
  if (raw === null || raw.trim() === '' || !Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

/**
 * A user-supplied URL, but only if it is one we are willing to put in an href.
 *
 * Profile links were stored as typed and rendered straight into an anchor, so
 * `javascript:` and `data:` were as acceptable as `https:`. The `type="url"`
 * input in settings is a client-side hint and nothing more — this is the check
 * that decides. Anything unparseable, or on a scheme a link should not carry,
 * is dropped rather than corrected, since guessing at intent would put the
 * reader somewhere the author did not name.
 *
 * @param value - Raw input of unknown shape
 * @returns The normalized http(s) URL, or null
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

/** Longest handle either network allows, with room to spare. */
const MAX_HANDLE_LENGTH = 30

/**
 * A social handle, reduced to the characters a handle can actually contain.
 *
 * These are interpolated into a profile URL, so an unchecked value put
 * arbitrary path and query text into the link. A leading "@" is accepted and
 * removed, because people type it.
 *
 * @param value - Raw input of unknown shape
 * @returns The bare handle, or null if nothing usable remains
 */
export function sanitizeHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^@+/, '')
  if (!trimmed || trimmed.length > MAX_HANDLE_LENGTH) return null
  return /^[A-Za-z0-9._]+$/.test(trimmed) ? trimmed : null
}

/**
 * Validation constants
 */
export const VALIDATION_LIMITS = {
  MAX_IMAGE_SIZE_MB: 10,
  /**
   * Photo originals, which are scans rather than catalogue thumbnails. A 24MP
   * negative scan is routinely 20-40MB, so the 10MB used for camera and film
   * images would reject ordinary work; this is set to accept that comfortably
   * while still bounding what one request can hand to sharp.
   */
  MAX_PHOTO_SIZE_MB: 50,
  /**
   * Files per upload request. The upload page sends one at a time, so this
   * only ever bites a request that was not made by it.
   */
  MAX_FILES_PER_UPLOAD: 25,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_CUSTOM_FIELD_LENGTH: 100,
  YEAR_MIN: 1800,
  YEAR_MAX: new Date().getFullYear(),
  ISO_MIN: 1,
  ISO_MAX: 100000
} as const
