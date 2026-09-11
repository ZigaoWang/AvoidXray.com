import {
  ADMIN_RESOURCES,
  coerceField,
  contributorFields,
  type FieldSpec,
  type ResourceName,
} from '@/lib/admin/resources'
import { toBodyType } from '@/lib/cameraFields'
import { toColorBalance, toFilmProcess } from '@/lib/filmFields'

/**
 * What a contributor's form sends, turned into what a column takes.
 *
 * `ADMIN_RESOURCES` already says which fields exist, what each one is and what
 * it accepts, and `coerceField` already parses numbers, splits lists and
 * checks enum members against it. This is the little that is left over: the
 * public forms offer words where the admin form offers members, because
 * "C-41" and "Point & shoot" are what is written on the thing in front of the
 * person filling the form in.
 *
 * That asymmetry is the only per-field rule outside the one declaration, and
 * it is deliberate. Everything else that used to live beside it — parsing the
 * year, splitting the aliases, wrapping a format in an array, checking a
 * length — restated what `coerceField` does from the FieldSpec, and the two
 * copies were free to disagree.
 */

/** Keyed by column, which is unambiguous: no camera field shares a film's name. */
const FROM_FORM_WORDING: Record<string, (value: string) => unknown> = {
  bodyType: toBodyType,
  process: toFilmProcess,
  colorBalance: toColorBalance,
  /**
   * The one three-state field on either record.
   *
   * Absent is "nobody has established it", which is not the same claim as
   * "the remjet has been removed" — that one is the whole reason CineStill
   * exists. A form sends the two words; everything else is refused rather
   * than quietly read as false.
   */
  hasRemjet: value => (value === 'true' ? true : value === 'false' ? false : null),
}

/**
 * One submitted value as the column's own vocabulary, or null if it is not a
 * value this column accepts. Callers turn that null into a 400 rather than
 * letting it reach the database as "clear this field".
 */
export function fromFormWording(field: string, value: string): unknown {
  const convert = FROM_FORM_WORDING[field]
  return convert ? convert(value) : value
}

/** How a route reads one field off whatever it was sent. */
export type FieldReader = (field: string) => string | null

/**
 * Every field a contributor may set on a new record, coerced and ready to
 * write.
 *
 * Used by the two create routes, which write without review and so were each
 * parsing a hand-kept list of fields twice over — once for multipart and once
 * for JSON. A field the add dialog collected and the list did not name was
 * dropped at creation with nothing said, which is how the frame format the
 * form has always asked for never reached a single new camera.
 */
export function submittedCatalogFields(
  resource: ResourceName,
  read: FieldReader
): { data: Record<string, unknown> } | { error: string } {
  const editable: Record<string, FieldSpec> = ADMIN_RESOURCES[resource].editable
  const data: Record<string, unknown> = {}

  for (const field of contributorFields(resource)) {
    const raw = read(field)?.trim()
    if (!raw) continue

    const spec = editable[field]
    const worded = fromFormWording(field, raw)
    if (worded === null || worded === undefined) {
      return { error: `${spec.label} is not one this catalog records.` }
    }

    const coerced = coerceField(spec, worded)
    if ('error' in coerced) return { error: coerced.error }
    data[field] = coerced.value
  }

  return { data }
}
