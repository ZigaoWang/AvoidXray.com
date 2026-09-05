/**
 * A citation, reduced to what a reader needs to judge it.
 *
 * A bare link is not enough. Fujifilm 400 is contract manufactured by Kodak and
 * the source that says so is the Wikipedia article on Superia, because that is
 * where the sentence lives — the film replaced Superia X-tra 400. A reader
 * shown "Kodak (reported)" linking to a page called "Fujifilm Superia" has no
 * way to tell a correct citation from a careless one without opening it and
 * reading, and the one that looks wrong here happens to be right.
 *
 * So the passage travels with the link. `claims` already records the words each
 * citation stands behind, for detecting when an edit moves out from under one;
 * the same text answers "does this source say that" at a glance.
 *
 * Pure, and importing nothing that reaches the database, because the admin
 * table renders these in a client component.
 */

/**
 * One citation as stored on FieldProvenance.claims.
 *
 * `claim` and `passage` are different things and conflating them is a way to
 * mislead a reader. `claim` holds the opening words of *our* text, so an edit
 * that moves out from under a citation can be detected. `passage` holds the
 * sentence in *the source*, so a reader can see the source says it. Quoting
 * `claim` as though it came from the source would show the site our own prose
 * back as evidence for itself.
 */
export interface StoredClaim {
  /** The opening words of our text that this citation stands behind. */
  claim?: string | null
  /** Verbatim from the cited page, recorded when the page was read. */
  passage?: string | null
  url?: string | null
  /** House voice: judgment rather than a claim, so it needs no source. */
  editorial?: boolean | null
}

export interface Citation {
  url: string
  /**
   * The words carrying the claim, when they were recorded.
   *
   * Null for a citation written before claims existed, or by a pass that only
   * stored a URL. Shown as such rather than hidden: "no passage recorded" is a
   * smaller problem than a link the reader is invited to assume supports
   * something.
   */
  passage: string | null
}

/** The provenance shape both catalogue pages already select. */
export interface ProvenanceRow {
  fieldName: string
  sourceUrl: string | null
  claims: unknown
}

/**
 * The citation for each field that has one.
 *
 * The passage comes from the first non-editorial claim carrying this field's
 * source URL, falling back to the first non-editorial claim with any text. A
 * field-level citation with no claim text yields a null passage rather than
 * being dropped, because the link is still worth offering.
 */
export function citationsByField(rows: readonly ProvenanceRow[]): Map<string, Citation> {
  const byField = new Map<string, Citation>()

  for (const row of rows) {
    if (!row.sourceUrl) continue

    const claims = (Array.isArray(row.claims) ? row.claims : []) as StoredClaim[]
    // Only a recorded passage counts. There is deliberately no fallback to
    // `claim`: that is our own wording, and presenting it as a quotation from
    // the source is worse than admitting nothing was recorded.
    const supporting = claims.filter(c => !c.editorial && c.passage)
    const matching = supporting.find(c => c.url === row.sourceUrl) ?? supporting[0]

    byField.set(row.fieldName, {
      url: row.sourceUrl,
      passage: matching?.passage ?? null,
    })
  }

  return byField
}

/**
 * What the link says when hovered.
 *
 * Quoting the passage is the point. Where none was recorded the tooltip says
 * so, because a confident "where this came from" over an unchecked link is the
 * thing that made a correct citation look careless.
 */
export function citationTitle(citation: Citation | undefined): string {
  if (!citation) return ''
  return citation.passage
    ? `“${citation.passage}” — opens the source`
    : 'Opens the source. No supporting passage was recorded for this claim.'
}
