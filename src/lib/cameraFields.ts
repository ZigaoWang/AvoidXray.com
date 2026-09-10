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

/**
 * A shutter speed as a photographer writes it: seconds above one, a fraction
 * below. The column stores seconds, so 0.002 has to come back as 1/500.
 */
function shutterSpeed(seconds: number): string {
  if (seconds >= 1) return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
  return `1/${Math.round(1 / seconds)}`
}

/** "f/2.8". The column is a Float, and JS prints 4 as "4", not "4.0". */
function aperture(f: number): string {
  return `f/${f}`
}

/** Every spec column the camera page can print. */
export interface CameraDetailSource {
  lensName?: string | null
  focalMinMm?: number | null
  focalMaxMm?: number | null
  apertureMaxWide?: number | null
  apertureMaxTele?: number | null
  closeFocusMm?: number | null
  focusType?: FocusType | null
  meteringPattern?: MeteringPattern | null
  exposureModes?: ExposureMode[]
  shutterType?: ShutterType | null
  shutterSlowestSec?: number | null
  shutterFastestSec?: number | null
  filmSpeedMin?: number | null
  filmSpeedMax?: number | null
  flash?: FlashFitting | null
  batteryType?: string | null
  weightGrams?: number | null
}

/**
 * The camera's measured specifications, labeled, for its own page.
 *
 * Separate from `cameraSpecs`, which is the short identity strip on a card and
 * stays as it is — a bare "35mm" chip for the format beside a bare "35mm" chip
 * for the lens would say nothing. These carry labels because "f/2.8" and
 * "1/500" mean nothing without one.
 *
 * Twenty-one columns were being written and four rendered: an editor could
 * record the Olympus XA's f/2.8 lens, aperture priority, 1/500 top speed and
 * 225g, and the page still printed only "Rangefinder, 35mm, 1979". Every one
 * of these is a fact somebody buying or loading the camera decides on.
 *
 * Only what is present, in one order, with no placeholder for what is missing —
 * the data is sparse, and a column of dashes is worse than a short list.
 */
export function cameraDetailSpecs(camera: CameraDetailSource): Array<{ label: string; value: string }> {
  const specs: Array<{ label: string; value: string }> = []

  // Focal length and maximum aperture read as one fact, and a zoom needs both
  // ends of each.
  const focal = camera.focalMinMm
    ? camera.focalMaxMm && camera.focalMaxMm !== camera.focalMinMm
      ? `${camera.focalMinMm}-${camera.focalMaxMm}mm`
      : `${camera.focalMinMm}mm`
    : null
  const fastest = camera.apertureMaxWide
    ? camera.apertureMaxTele && camera.apertureMaxTele !== camera.apertureMaxWide
      ? `${aperture(camera.apertureMaxWide)}-${camera.apertureMaxTele}`
      : aperture(camera.apertureMaxWide)
    : null
  const lens = [camera.lensName?.trim() || null, focal, fastest].filter(Boolean).join(' ')
  if (lens) specs.push({ label: 'Lens', value: lens })

  const focus = focusTypeLabel(camera.focusType)
  if (focus) specs.push({ label: 'Focus', value: focus })

  // Stored in millimetres, which nobody says out loud: 800 is 0.8m, 350 is 35cm.
  if (camera.closeFocusMm) {
    const mm = camera.closeFocusMm
    specs.push({
      label: 'Close focus',
      value: mm >= 1000 ? `${(mm / 1000).toFixed(1)}m` : `${Math.round(mm / 10)}cm`,
    })
  }

  const shutterRange =
    camera.shutterSlowestSec && camera.shutterFastestSec
      ? `${shutterSpeed(camera.shutterSlowestSec)} to ${shutterSpeed(camera.shutterFastestSec)}`
      : camera.shutterFastestSec
        ? `to ${shutterSpeed(camera.shutterFastestSec)}`
        : null
  const shutter = [shutterTypeLabel(camera.shutterType), shutterRange].filter(Boolean).join(', ')
  if (shutter) specs.push({ label: 'Shutter', value: shutter })

  const modes = (camera.exposureModes ?? []).map(exposureModeLabel).filter(Boolean)
  if (modes.length) specs.push({ label: 'Exposure', value: modes.join(', ') })

  const metering = meteringLabel(camera.meteringPattern)
  if (metering) specs.push({ label: 'Metering', value: metering })

  // What film the meter can be set to, which decides whether a stock is usable
  // in this body at box speed.
  if (camera.filmSpeedMin && camera.filmSpeedMax) {
    specs.push({ label: 'Film speed', value: `ISO ${camera.filmSpeedMin}-${camera.filmSpeedMax}` })
  }

  const flash = flashLabel(camera.flash)
  if (flash) specs.push({ label: 'Flash', value: flash })

  // An obsolete battery is a buying decision, so it is worth its own line.
  if (camera.batteryType?.trim()) specs.push({ label: 'Battery', value: camera.batteryType.trim() })
  if (camera.weightGrams) specs.push({ label: 'Weight', value: `${camera.weightGrams}g` })

  return specs
}
