/**
 * The site's side of the vision worker (vision/worker.ts).
 *
 * The worker answers with photo ids and scores for every photo it has seen,
 * private and unchecked ones included. Callers look the ids up through their
 * usual visibility and block filters, which is what keeps those rules in one
 * place rather than duplicated in a second process.
 *
 * Every call degrades to null. Search and "More like this" are extras on pages
 * that work without them, so a worker that is restarting or down must never
 * turn into an error page.
 */

export const VISION_URL = process.env.VISION_URL || 'http://127.0.0.1:3210'

/**
 * Long enough for a query on a busy worker, which is one text encoding of
 * about 50ms per phrasing. Short enough that a worker that has stopped
 * answering costs a search page a fraction of a second.
 */
const TIMEOUT_MS = 2500

export interface VisionMatch {
  id: string
  score: number
}

async function ask(path: string): Promise<VisionMatch[] | null> {
  try {
    const res = await fetch(`${VISION_URL}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { results?: VisionMatch[] }
    return Array.isArray(body.results) ? body.results : null
  } catch {
    return null
  }
}

/** Photos whose content matches the words, best first. Empty when nothing clears the cutoff. */
export function searchPhotoContent(query: string, limit = 200) {
  return ask(`/search?q=${encodeURIComponent(query)}&limit=${limit}`)
}

/** Of these photos, the ones whose content matches the words, best first. */
export async function searchAmong(query: string, ids: string[]): Promise<VisionMatch[] | null> {
  try {
    const res = await fetch(`${VISION_URL}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: query, ids }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { results?: VisionMatch[] }
    return Array.isArray(body.results) ? body.results : null
  } catch {
    return null
  }
}

/** Photos that look most like this one, closest first. */
export function similarPhotos(photoId: string, limit = 60) {
  return ask(`/similar?id=${encodeURIComponent(photoId)}&limit=${limit}`)
}
