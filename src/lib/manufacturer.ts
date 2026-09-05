import type { ManufacturerStatus } from '@prisma/client'

/**
 * How a film's manufacturer reads to someone who has never thought about it.
 *
 * The name on the box is often not the company that coated the film, and that
 * is the single most useful thing this catalogue knows. Saying it plainly is
 * the whole point: telling a reader Fujifilm 400 is made by Kodak is a
 * different claim from telling them it is widely reported to be, and the second
 * one is the honest version.
 *
 * The qualifier carries that distinction, so it is deliberately a plain word.
 * "Reported" is what a person would say. "Attributed" is the schema's word and
 * means nothing to a reader.
 *
 * Importing nothing but a type, so the same wording is available to a server
 * page, a client picker and the admin table. Four places rendering this four
 * ways is how a catalogue starts contradicting itself.
 */

export interface ManufacturerInput {
  status: ManufacturerStatus
  /** The name on the box. */
  brandName: string
  /** The company that coats it, when that is recorded. */
  manufacturerName?: string | null
  /** Where the claim came from, for the ones that are reported rather than known. */
  sourceUrl?: string | null
}

export interface ManufacturerDisplay {
  /** The company name, or the conclusion when there is no name to give. */
  value: string
  /** A plain qualifier, shown after the name. Null when none is needed. */
  qualifier: string | null
  /** Attached to the qualifier, never to the name. */
  sourceUrl: string | null
  /** True when nobody has established it, so the value is a conclusion. */
  unconfirmed: boolean
}

/**
 * Always returns something. The row is always rendered, because a row that
 * disappears on the common case makes "not confirmed" and "never filled in"
 * look identical, and those are different claims.
 */
export function manufacturerDisplay(input: ManufacturerInput): ManufacturerDisplay {
  const { status, brandName, manufacturerName, sourceUrl } = input

  switch (status) {
    // The brand coats its own film. Just the name: a qualifier here would
    // imply a distinction that does not exist.
    case 'SAME_AS_BRAND':
      return { value: brandName, qualifier: null, sourceUrl: null, unconfirmed: false }

    // Confirmed to be someone else. The name alone is informative, because it
    // differs from the brand the reader just read at the top of the page.
    case 'KNOWN':
      return {
        value: manufacturerName ?? brandName,
        qualifier: null,
        sourceUrl: sourceUrl ?? null,
        unconfirmed: false,
      }

    // Widely reported, never confirmed. The qualifier is the feature.
    case 'ATTRIBUTED':
      return {
        value: manufacturerName ?? brandName,
        qualifier: 'reported',
        sourceUrl: sourceUrl ?? null,
        unconfirmed: false,
      }

    // A researched conclusion, not an empty field. "Unknown" reads as though
    // nobody filled it in; "Not confirmed" says somebody looked.
    case 'UNKNOWN':
    default:
      return { value: 'Not confirmed', qualifier: null, sourceUrl: null, unconfirmed: true }
  }
}

/**
 * The one sentence explaining why a brand and a manufacturer differ.
 *
 * Shown once near the field rather than as a tooltip on every row. Most people
 * have never considered that the name on the box is not the company that coated
 * the film, and that idea is the reason the field exists.
 */
export const MANUFACTURER_EXPLAINER =
  'The name on the box is not always the company that made the film. ' +
  'Some brands coat their own; others buy it from someone who does.'
