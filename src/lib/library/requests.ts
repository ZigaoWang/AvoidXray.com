import type { LibraryFilters } from './browse'

/** Photos one library request may act on. */
export const MAX_IDS = 500

/** Distinct string ids from a request body, or null when there are none or too many. */
export function parseIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 100))]
  return ids.length > 0 && ids.length <= MAX_IDS ? ids : null
}

/** The library filters from a query string, as the page writes them into its URL. */
export function parseFilters(params: URLSearchParams): Omit<LibraryFilters, 'ids'> & { q?: string } {
  const text = (name: string) => params.get(name)?.trim() || undefined
  const yearParam = params.get('year')
  const year = Number(yearParam)
  const status = params.get('status')
  return {
    filmStockId: text('film'),
    cameraId: text('camera'),
    labId: text('lab'),
    year: yearParam === 'undated' ? 'undated' : Number.isInteger(year) && year > 1800 && year < 3000 ? year : undefined,
    status: status === 'published' || status === 'private' ? status : undefined,
    missingGear: params.get('missing') === 'gear' || undefined,
    q: text('q')?.slice(0, 200),
  }
}
