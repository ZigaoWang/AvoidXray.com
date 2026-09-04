import type { CameraBodyType, FrameFormat } from '@prisma/client'

/**
 * Display and entry vocabulary for the camera enums.
 *
 * The database stores identifiers it can legally name (`COMPACT`); people read
 * words ("Point & shoot"). Keyed off the generated Prisma types, so adding a
 * member to the schema and forgetting to label it is a type error rather than a
 * page that prints an enum member at a reader.
 */

export const BODY_TYPE_LABELS: Record<CameraBodyType, string> = {
  SLR: 'SLR',
  RANGEFINDER: 'Rangefinder',
  COMPACT: 'Point & shoot',
  TLR: 'TLR',
  FOLDING: 'Folding',
  VIEW: 'View camera',
  INSTANT: 'Instant',
  DISPOSABLE: 'Disposable',
}

export const FRAME_FORMAT_LABELS: Record<FrameFormat, string> = {
  FULL_FRAME: 'Full frame',
  HALF_FRAME: 'Half-frame',
  PANORAMIC: 'Panoramic',
  SPROCKET_HOLE: 'Sprocket hole',
}

/** The members a form offers, in the order they should be listed. */
export const BODY_TYPES = Object.keys(BODY_TYPE_LABELS) as CameraBodyType[]
export const FRAME_FORMATS = Object.keys(FRAME_FORMAT_LABELS) as FrameFormat[]

export function bodyTypeLabel(value: CameraBodyType | null | undefined): string | null {
  return value ? BODY_TYPE_LABELS[value] : null
}

export function frameFormatLabel(value: FrameFormat | null | undefined): string | null {
  return value ? FRAME_FORMAT_LABELS[value] : null
}

/**
 * The same label with an article, for running prose — "a rangefinder", "an SLR".
 *
 * Sentences on the camera pages read "<name> is a <type>", and lowercasing the
 * stored value gave "a slr". The article is per-member rather than computed
 * from the first letter, because SLR and TLR are read as initialisms.
 */
const BODY_TYPE_PROSE: Record<CameraBodyType, string> = {
  SLR: 'an SLR',
  RANGEFINDER: 'a rangefinder',
  COMPACT: 'a point & shoot',
  TLR: 'a TLR',
  FOLDING: 'a folding camera',
  VIEW: 'a view camera',
  INSTANT: 'an instant camera',
  DISPOSABLE: 'a disposable camera',
}

/** Falls back to the generic noun when the body type has not been classified. */
export function bodyTypeProse(value: CameraBodyType | null | undefined): string {
  return value ? BODY_TYPE_PROSE[value] : 'a film camera'
}

/**
 * The wording the free-text column used, mapped to the member that replaces it.
 *
 * Present because the column is still being written during expand-and-contract,
 * and because a client built against the old list is still entitled to submit
 * "Point & Shoot". Without this those requests coerce to null and quietly erase
 * the field they were trying to set.
 *
 * "Medium Format" and "Large Format" were in that list and describe the film
 * rather than the body. Large format implies a view camera and maps; medium
 * format implies nothing about mechanism and is dropped to null.
 */
const LEGACY_BODY_TYPES: Record<string, CameraBodyType> = {
  'slr': 'SLR',
  'rangefinder': 'RANGEFINDER',
  'point & shoot': 'COMPACT',
  'point and shoot': 'COMPACT',
  'compact': 'COMPACT',
  'tlr': 'TLR',
  'folding': 'FOLDING',
  'instant': 'INSTANT',
  'disposable': 'DISPOSABLE',
  'large format': 'VIEW',
  'view camera': 'VIEW',
}

/**
 * Accepts a member or the older display wording, and returns the member.
 *
 * Null for anything else — including the empty string — because the column is
 * nullable and "not yet classified" is a legitimate answer. A value that does
 * not map is not an error to report; it is a gap to leave visible.
 */
export function toBodyType(input: string | null | undefined): CameraBodyType | null {
  if (!input) return null
  if ((BODY_TYPES as string[]).includes(input)) return input as CameraBodyType
  return LEGACY_BODY_TYPES[input.trim().toLowerCase()] ?? null
}

export function toFrameFormat(input: string | null | undefined): FrameFormat | null {
  if (!input) return null
  return (FRAME_FORMATS as string[]).includes(input) ? (input as FrameFormat) : null
}
