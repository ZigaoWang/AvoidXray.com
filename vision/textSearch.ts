/**
 * How a text query is scored against the photo index: the vision worker's
 * /search, and scripts/vision-eval.ts, which measures the same thing over the
 * real library when the cutoffs below are tuned. One copy, so a measurement is
 * of the rule the worker runs. No model or database here; callers pass both in.
 */

/**
 * Phrasings averaged into one query vector. A single phrasing makes results
 * swing on wording; the average is steadier. "film photo" because these are.
 */
export const TEMPLATES = ['a photo of {}.', 'a film photo of {}.', 'a picture of {}.']

/**
 * Prompts that describe nothing in particular. How well a photo matches these
 * is how well it matches anything, and subtracting it is what stops photos
 * that score high for every query from topping every search.
 */
export const NEUTRAL = ['something', 'a photo', 'an image', 'a scene']

/**
 * The lowest margin a photo needs to count as a match (see `margin`).
 *
 * Measured on all of the site's photos: subjects in none of them (giraffe,
 * kangaroo, elephant) top out between 0.020 and 0.027, and most real matches
 * score above 0.03. At 0.02 a bus deck came back for "giraffe"; at 0.03 half
 * the real results for "girl" were lost. A query with nothing above it returns
 * nothing, which is the answer people should get.
 */
export const MIN_MARGIN = 0.025

/** How far a query's best matches must stand above its typical photo (see `scoreQuery`). */
export const MIN_SPREAD = 0.032

/**
 * How far a match must stand above the query's typical photo, as well as
 * clearing MIN_MARGIN.
 *
 * A place name lifts every photo of a city a little: "tokyo" put the median
 * photo at +0.026, above MIN_MARGIN, so 761 of 1,477 photos matched, most of
 * them Shanghai and London. Looking down the ranked lists for tokyo, london
 * and shanghai, the photos of the place end about 0.030 above the median.
 * For an ordinary subject the median is below zero, so MIN_MARGIN stays the
 * higher bar and its results do not change.
 */
export const MIN_LIFT = 0.03

export function normalize(v: Float32Array): Float32Array {
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum) || 1
  return v.map(x => x / n)
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function mean(vs: Float32Array[]): Float32Array {
  const out = new Float32Array(vs[0].length)
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i]
  return normalize(out)
}

/**
 * One vector for a search phrase, averaged over the templates.
 *
 * Lowercased first: SigLIP 2 was trained on lowercased text, and read a
 * capital as noise. "Cat" scored like "hi" while "cat" found the cats, and
 * every place name typed as a name ("London", "Big Ben") was refused as vague.
 */
export async function encodeQuery(encodeText: (text: string) => Promise<Float32Array>, query: string): Promise<Float32Array> {
  const words = query.toLowerCase()
  return mean(await Promise.all(TEMPLATES.map(t => encodeText(t.replace('{}', words)))))
}

/**
 * The photos a query can be scored against. Every completed community photo
 * with a vector is held, private ones too, so the owner's library can be
 * searched by content; `searchable` is the subset a stranger can see, the only
 * one the site's search and "More like this" draw from.
 */
export interface PhotoIndex {
  vectors: Map<string, Float32Array>
  /** Each photo's similarity to the neutral prompts. */
  baselines: Map<string, number>
  searchable: Set<string>
}

/**
 * How much more a photo matches the query than it matches anything at all.
 *
 * Raw similarity was tried first. Some photos and some phrases score high
 * against everything, so "double exposure" gave 76% to ordinary buildings and
 * a fixed cutoff both hid real cats and let junk through.
 */
export function margin(index: PhotoIndex, query: Float32Array, id: string): number {
  return dot(query, index.vectors.get(id)!) - index.baselines.get(id)!
}

export interface QueryScore {
  /** Too vague to rank by content; the caller falls back to words. */
  vague: boolean
  /** Matches at or above the cutoff, best first. */
  results: { id: string; score: number }[]
  /** Over the searchable photos, for measuring: the median margin and the 99th percentile. */
  median: number
  p99: number
}

/**
 * Scores a query over the searchable photos, or, with `only`, over those ids
 * whatever their visibility (one owner's library, which the site names).
 *
 * Vagueness is judged over the searchable photos either way, so a query means
 * the same in the library as on the site.
 *
 * A query that describes nothing in particular, such as "zzqx" or "hi",
 * matches the typical photo about as well as the neutral prompts do, so half
 * the library clears the cutoff. Real subjects describe something specific
 * and match the typical photo worse: measured over the library, "cat" has a
 * median margin of -0.010 and "food" -0.028, while "zzqx" has +0.018 and
 * returned 290 photos.
 *
 * A median above zero alone also caught subjects the library is full of:
 * "street", "night", "city" and "sky" all sit at +0.003 to +0.015 and returned
 * nothing, while "night street" returned 130. What tells them apart is spread.
 * A real subject lifts the photos that show it well above the rest, and a
 * vague word lifts every photo alike. Measured as the 99th percentile minus
 * the median: 0.035 and up for every real subject tried, 0.029 and under for
 * every vague word.
 */
export function scoreQuery(index: PhotoIndex, query: Float32Array, only?: Set<string>): QueryScore {
  const sorted = [...index.searchable].map(id => margin(index, query, id)).sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 0
  if (median > 0 && p99 - median < MIN_SPREAD) return { vague: true, results: [], median, p99 }
  const cutoff = Math.max(MIN_MARGIN, median + MIN_LIFT)
  const pool = only ? [...only].filter(id => index.vectors.has(id)) : [...index.searchable]
  const results = pool
    .map(id => ({ id, score: margin(index, query, id) }))
    .filter(r => r.score >= cutoff)
    .sort((a, b) => b.score - a.score)
  return { vague: false, results, median, p99 }
}
