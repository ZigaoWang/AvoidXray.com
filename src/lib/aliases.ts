/**
 * Helpers for alternate names, usable on either side of the network.
 *
 * Deliberately importing nothing. These are needed by the pickers in the
 * browser and by the search endpoint on the server, and when they lived beside
 * the database query the whole Prisma client followed them into the client
 * bundle and every page threw on load.
 */

/**
 * Letters and digits of any script, with spacing and punctuation dropped, so
 * "Lucky C-400" and "lucky c400" compare equal.
 *
 * `[^a-z0-9]` was the earlier rule, and it deleted every script that is not
 * Latin. An alias written wholly in Chinese, Japanese or Cyrillic came out as
 * the empty string — and every string contains the empty string, so the filter
 * below decided it was already covered by the name and dropped it. 乐凯,
 * ナチュラ and Свема were all silently missing from the records that had them.
 */
function comparable(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Alternate names worth showing beside a record, minus any the name already
 * contains. "kodak gold 200" adds nothing beside "Kodak Gold 200"; "5219" and
 * 乐凯 do.
 *
 * Containment, not equality: an alias is dropped only when its letters and
 * digits appear in the name in the same order and unbroken, so "Kentmere 400"
 * survives beside "Kentmere Pan 400" — the word between them makes it a
 * genuinely different string people search for.
 */
export function usefulAliases(name: string, aliases: string[]): string[] {
  const haystack = comparable(name)
  return aliases.filter(alias => {
    const needle = comparable(alias)
    // An alias of pure punctuation says nothing; anything else is compared.
    // Without this the empty needle would match every name, which is the bug
    // the note above describes.
    if (!needle) return false
    return !haystack.includes(needle)
  })
}
