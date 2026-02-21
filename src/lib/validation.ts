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
 * Validation constants
 */
export const VALIDATION_LIMITS = {
  MAX_IMAGE_SIZE_MB: 10,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_CUSTOM_FIELD_LENGTH: 100,
  YEAR_MIN: 1800,
  YEAR_MAX: new Date().getFullYear(),
  ISO_MIN: 1,
  ISO_MAX: 100000
} as const
