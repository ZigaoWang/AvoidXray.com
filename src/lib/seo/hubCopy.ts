/**
 * Titles and descriptions for the film, camera and pairing pages, sized for a
 * search result. Google cuts a title near 60 characters and a description near
 * 155, and what gets cut is whatever came last, so the query people type
 * ("kodak gold 200 sample photos") goes first and everything after it is a
 * bonus that is dropped whole rather than truncated mid-word.
 */

/** Appended by the root layout's title template. */
const TITLE_SUFFIX = ' – AvoidXray'
const TITLE_BUDGET = 60
const DESCRIPTION_BUDGET = 155
/** Room below which an overflowing sentence is dropped rather than cut. */
const MIN_CUT_LENGTH = 40

/** The first candidate that fits with the site name appended, else the last. */
export function fitTitle(...candidates: string[]): string {
  return (
    candidates.find((c) => c.length + TITLE_SUFFIX.length <= TITLE_BUDGET) ??
    candidates[candidates.length - 1]
  )
}

/**
 * Sentences, in order, for as long as they fit. The one that overflows is cut
 * at a word boundary rather than dropped, unless too little room is left for it
 * to say anything: dropping it whole left film pages with nothing but a count.
 */
export function fitDescription(sentences: Array<string | null | undefined | false>): string {
  let out = ''
  for (const sentence of sentences) {
    if (!sentence) continue
    const next = out ? `${out} ${sentence}` : sentence
    if (next.length <= DESCRIPTION_BUDGET) {
      out = next
      continue
    }
    if (DESCRIPTION_BUDGET - out.length < MIN_CUT_LENGTH) break
    const cut = next
      .slice(0, DESCRIPTION_BUDGET - 1)
      .replace(/[\s,;:]+\S*$/, '')
      // "…from a…" reads as broken; end on a word that carries meaning.
      .replace(/(\s+(a|an|and|at|by|for|from|in|of|on|or|the|to|with))+$/i, '')
    return `${cut}…`
  }
  return out
}

/** "one photographer", "12 photographers". */
export function photographersPhrase(count: number): string {
  return count === 1 ? 'one photographer' : `${count} photographers`
}

/**
 * "Kodak Gold 200 sample photos: 42 scans from 9 photographers."
 * Null when there is nothing to count, so no page ever advertises zero.
 */
export function sampleCountSentence(subject: string, photos: number, photographers: number): string | null {
  if (photos === 0) return null
  const scans = photos === 1 ? 'one scan' : `${photos} scans`
  return `${subject} sample photos: ${scans} from ${photographersPhrase(photographers)}.`
}
