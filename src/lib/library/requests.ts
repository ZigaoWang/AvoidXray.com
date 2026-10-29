/** Photos one library request may act on. */
export const MAX_IDS = 500

/** Distinct string ids from a request body, or null when there are none or too many. */
export function parseIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 100))]
  return ids.length > 0 && ids.length <= MAX_IDS ? ids : null
}
