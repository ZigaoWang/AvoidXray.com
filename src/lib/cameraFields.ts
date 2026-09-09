import type {
  CameraBodyType,
  ExposureMode,
  FlashFitting,
  FocusType,
  FrameFormat,
  MeteringPattern,
  ShutterType,
} from '@prisma/client'

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
/**
 * The five enums that had no label map at all.
 *
 * They were reaching two readers as raw schema identifiers: the admin edit
 * form offered "BUILT_IN_AND_HOT_SHOE" in a dropdown, and the revision queue
 * showed an approved change as "flash: — → BUILT_IN_AND_HOT_SHOE". Neither
 * failed the enum-label test, because the test only checks the enums somebody
 * remembered to register in it.
 */
export const FOCUS_TYPE_LABELS: Record<FocusType, string> = {
  FIXED: 'Fixed focus',
  ZONE: 'Zone focus',
  SCALE: 'Scale focus',
  RANGEFINDER: 'Rangefinder',
  SLR_MANUAL: 'Manual, through the lens',
  AUTOFOCUS: 'Autofocus',
}

export const METERING_LABELS: Record<MeteringPattern, string> = {
  NONE: 'No meter',
  AVERAGE: 'Averaging',
  CENTER_WEIGHTED: 'Center-weighted',
  SPOT: 'Spot',
  MULTI_ZONE: 'Multi-zone',
}

export const EXPOSURE_MODE_LABELS: Record<ExposureMode, string> = {
  PROGRAM: 'Program',
  APERTURE_PRIORITY: 'Aperture priority',
  SHUTTER_PRIORITY: 'Shutter priority',
  MANUAL: 'Manual',
}

export const SHUTTER_TYPE_LABELS: Record<ShutterType, string> = {
  LEAF: 'Leaf',
  FOCAL_PLANE: 'Focal plane',
  ELECTRONIC: 'Electronic',
}

export const FLASH_LABELS: Record<FlashFitting, string> = {
  NONE: 'None',
  BUILT_IN: 'Built in',
  HOT_SHOE: 'Hot shoe',
  BUILT_IN_AND_HOT_SHOE: 'Built in and hot shoe',
}

export const FOCUS_TYPES = Object.keys(FOCUS_TYPE_LABELS) as FocusType[]
export const METERING_PATTERNS = Object.keys(METERING_LABELS) as MeteringPattern[]
export const EXPOSURE_MODES = Object.keys(EXPOSURE_MODE_LABELS) as ExposureMode[]
export const SHUTTER_TYPES = Object.keys(SHUTTER_TYPE_LABELS) as ShutterType[]
export const FLASH_FITTINGS = Object.keys(FLASH_LABELS) as FlashFitting[]

export function focusTypeLabel(v: FocusType | null | undefined): string | null {
  return v ? FOCUS_TYPE_LABELS[v] : null
}
export function meteringLabel(v: MeteringPattern | null | undefined): string | null {
  return v ? METERING_LABELS[v] : null
}
export function exposureModeLabel(v: ExposureMode | null | undefined): string | null {
  return v ? EXPOSURE_MODE_LABELS[v] : null
}
export function shutterTypeLabel(v: ShutterType | null | undefined): string | null {
  return v ? SHUTTER_TYPE_LABELS[v] : null
}
export function flashLabel(v: FlashFitting | null | undefined): string | null {
  return v ? FLASH_LABELS[v] : null
}

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

/** What a camera card shows about a camera. See `cameraSpecs`. */
export interface CameraSpecSource {
  bodyType?: CameraBodyType | null
  frameFormat?: FrameFormat | null
  format?: string | null
  year?: number | null
}

/**
 * The camera's specifications as short chips, in the order the camera page
 * prints them.
 *
 * Derived here rather than assembled per page. The card these feed was already
 * one shared component, but each of the three pages using it decided for itself
 * what to put inside: the pairing page listed four facts, the photo page listed
 * none for a camera and one for a film, so the two cards sitting side by side
 * under a photograph did not even match each other. Sharing the component
 * without sharing the vocabulary is only half the job.
 *
 * Frame format is omitted when it is FULL_FRAME, exactly as the camera page
 * omits it: nearly every 35mm body is full frame, so printing it on all of them
 * is noise, and half-frame or panoramic is the thing a reader needs told.
 */
export function cameraSpecs(camera: CameraSpecSource): string[] {
  return [
    bodyTypeLabel(camera.bodyType),
    camera.frameFormat && camera.frameFormat !== 'FULL_FRAME'
      ? frameFormatLabel(camera.frameFormat)
      : null,
    camera.format?.trim() || null,
    camera.year ? String(camera.year) : null,
  ].filter((s): s is string => Boolean(s))
}
