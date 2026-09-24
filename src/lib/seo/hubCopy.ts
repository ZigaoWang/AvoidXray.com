/**
 * Wording shared by the film, camera and pairing pages' titles and
 * descriptions. The query people type ("kodak gold 200 sample photos") leads,
 * so it survives when Google shortens a result to fit. Nothing here trims to a
 * length: Google measures in pixels and cuts for itself, and a sentence cut
 * short here would read as broken (see summaryFromDescription).
 */

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
