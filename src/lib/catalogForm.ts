/**
 * What a contributor fills in when they add or correct a catalog entry.
 *
 * One shape, used by the add dialog and the suggest-edit dialog, because they
 * ask about the same record and had drifted into asking differently. Adding a
 * camera never asked for its brand at all, so every body added through the site
 * arrived with no maker; only the edit form could supply one afterwards. The
 * two also disagreed on which fields existed, what order they came in, how the
 * preloaded film was chosen, and what the help under each one said.
 */

import type { ColorBalance, FilmProcess } from '@prisma/client'
import {
  closeFocusParts,
  parseCloseFocusMm,
  parseShutterSeconds,
  shutterSpeedLabel,
  type CloseFocusUnit,
} from '@/lib/cameraFields'
import { colorBalanceLabel, filmProcessLabel } from '@/lib/filmFields'
import { displayValue } from '@/lib/admin/resources'
import { FORMATS } from '@/lib/constants'

/** Matches the CHECK on both summary columns: null, or 20 to 200 characters. */
export const SUMMARY_MIN = 20
export const SUMMARY_MAX = 200

export type CatalogType = 'camera' | 'film'

/**
 * The values both dialogs hold.
 *
 * `maker` is one field for what the two kinds call by different names: a
 * camera's brand and a film's manufacturer are the same question, and asking
 * it the same way is most of what makes the two forms feel like one form.
 */
export interface CatalogDraft {
  name: string
  maker: string
  description: string
  /** Comma separated, as typed. */
  aliases: string

  // Camera — what it is
  bodyType: string
  /** A FrameFormat member, or empty for "not checked". */
  frameFormat: string
  /** Comma separated. A camera takes one gauge; a stock may be sold in several. */
  format: string
  /** Filled only when `format` includes the literal "Other". */
  customFormat: string
  year: string
  defaultFilmStockId: string

  // Camera — lens
  lensName: string
  focalMinMm: string
  focalMaxMm: string
  apertureMaxWide: string
  apertureMaxTele: string
  lensElements: string
  lensGroups: string
  /** Asked in the unit chosen beside it; the column stores millimetres. */
  closeFocus: string
  closeFocusUnit: CloseFocusUnit

  // Camera — exposure
  focusType: string
  meteringPattern: string
  /** Comma separated ExposureMode members, which is what the column holds. */
  exposureModes: string
  shutterType: string
  /** As it is written on the dial — "1/500", "8s". The column stores seconds. */
  shutterSlowest: string
  shutterFastest: string
  filmSpeedMin: string
  filmSpeedMax: string

  // Camera — body
  flash: string
  batteryType: string
  weightGrams: string

  // Film — what it is
  iso: string
  process: string
  colorBalance: string
  chromaticity: string
  polarity: string

  // Film — who makes it
  manufacturerStatus: string
  manufacturedByBrandId: string

  // Film — measured
  rmsGranularity: string
  resolvingPowerLpmm: string
  latitudeUnderStops: string
  latitudeOverStops: string
  baseMaterial: string
  /** 'true', 'false', or empty for "nobody has established it". */
  hasRemjet: string

  // Film — where it comes from
  parentStockId: string
  respoolNotes: string
}

export function emptyDraft(): CatalogDraft {
  return {
    name: '', maker: '', description: '', aliases: '',
    bodyType: '', frameFormat: '', format: '', customFormat: '', year: '', defaultFilmStockId: '',
    lensName: '', focalMinMm: '', focalMaxMm: '', apertureMaxWide: '', apertureMaxTele: '',
    lensElements: '', lensGroups: '', closeFocus: '', closeFocusUnit: 'cm',
    focusType: '', meteringPattern: '', exposureModes: '', shutterType: '',
    shutterSlowest: '', shutterFastest: '', filmSpeedMin: '', filmSpeedMax: '',
    flash: '', batteryType: '', weightGrams: '',
    iso: '', process: '', colorBalance: '', chromaticity: '', polarity: '',
    manufacturerStatus: '', manufacturedByBrandId: '',
    rmsGranularity: '', resolvingPowerLpmm: '', latitudeUnderStops: '', latitudeOverStops: '',
    baseMaterial: '', hasRemjet: '', parentStockId: '', respoolNotes: '',
  }
}

/**
 * The gauges actually meant, once "Other" has been resolved to what was typed.
 *
 * A list rather than a value, because a stock's column is one: the form was
 * single-select over it, so approving a format edit on a film sold in 35mm
 * and 120 replaced the pair with one entry and the other gauge vanished from
 * the page. A camera ticks one and the list is one long.
 */
export function resolvedFormat(draft: CatalogDraft): string {
  const chosen = draft.format.split(',').map(f => f.trim()).filter(Boolean)
  const other = chosen.indexOf('Other')
  if (other === -1) return chosen.join(', ')

  const typed = draft.customFormat.trim()
  chosen.splice(other, 1, ...(typed ? [typed] : []))
  return chosen.join(', ')
}

/**
 * The summary a description implies, or null when it implies none.
 *
 * The summary is the identifying sentence: what search results and link
 * previews show, and what the page prints above the description. It has been
 * settable in the admin table alone, so no entry added through the site ever
 * had one, and the sentence people naturally write first ended up as the
 * opening line of the description instead. The page then showed no summary and
 * a description that led with exactly what the summary was supposed to carry.
 *
 * So it is derived rather than asked for a second time. The migration that
 * added the column anticipated this: its own note says the field should be
 * required and is not yet, because some entries have no description to derive
 * one from.
 *
 * The first line, because that is where the identifying sentence goes and it is
 * what people already write. If the line is too long to be a summary, its first
 * sentence is tried instead. Anything else answers null: under twenty
 * characters the database refuses it, and a fragment cut to fit is worse than
 * an empty field.
 */
export function summaryFromDescription(description: string | null | undefined): string | null {
  const text = (description ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return null

  const firstLine = text.split('\n')[0].trim()
  if (firstLine.length >= SUMMARY_MIN && firstLine.length <= SUMMARY_MAX) return firstLine

  if (firstLine.length > SUMMARY_MAX) {
    // A period that ends a sentence rather than an abbreviation: followed by a
    // space and a capital, or by the end of the text. "1/1200 sec." mid-line
    // does not end anything.
    const sentence = /^(.+?[.!?])(\s+[A-Z(]|$)/.exec(firstLine)?.[1]?.trim()
    if (sentence && sentence.length >= SUMMARY_MIN && sentence.length <= SUMMARY_MAX) return sentence
  }

  // Nothing usable. Cutting the line at the last word that fits was the other
  // option, and running it over the catalog is what ruled it out: it produced
  // "one of Kodak's most budget-friendly consumer-grade options alongside" and
  // stopped there. A sentence that ends mid-clause is read as the entry being
  // broken, and it would sit above the full text that says the same thing
  // properly. The field stays empty until somebody writes one.
  return null
}

/**
 * Whether a stored summary came from its description rather than from a person.
 *
 * The two fields are kept in step by rederiving one from the other, which is
 * only safe if a summary somebody wrote by hand is left alone. Nothing records
 * which is which, so this asks the question the stored values can answer: a
 * summary equal to what its own description implies was derived from it.
 *
 * Compared against the description as it is *now*. A summary that was derived
 * and has since had its description reworded no longer matches, and is
 * correctly treated as stale rather than as authored, because the caller is
 * about to replace the description anyway.
 */
export function summaryWasDerived(
  summary: string | null | undefined,
  description: string | null | undefined
): boolean {
  const stored = summary?.trim()
  if (!stored) return false
  return stored === summaryFromDescription(description)
}

/**
 * A catalog row, as much of it as the form reads.
 *
 * One prop instead of fifteen. Every field used to be named five more times
 * after its control: a prop on the button, a prop on the modal, a line in the
 * `initial` memo, an entry in that memo's dependency array, and a `diff()`
 * call that had to use the server's spelling. Missing any one of them left a
 * control that never pre-filled or never submitted, with nothing to say so.
 */
export type CatalogRecord = { id: string; name: string } & Record<string, unknown>

const text = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value)

const commaList = (value: unknown): string =>
  Array.isArray(value) ? value.join(', ') : text(value)

/**
 * A stored format split into the gauges the form offers and the ones it does
 * not, which go in the "Other" box.
 *
 * Without this a 127 camera opened a control with nothing selected, and the
 * first edit to any other field would have looked like a choice to drop it.
 */
function formatParts(stored: string): { format: string; customFormat: string } {
  const gauges = stored.split(',').map(f => f.trim()).filter(Boolean)
  const listed = gauges.filter(f => (FORMATS as readonly string[]).includes(f))
  const rest = gauges.filter(f => !(FORMATS as readonly string[]).includes(f))
  return {
    format: [...listed, ...(rest.length ? ['Other'] : [])].join(', '),
    customFormat: rest.join(', '),
  }
}

/** The record as the form holds it, ready to be edited and compared against. */
export function draftFromRecord(type: CatalogType, record: CatalogRecord): CatalogDraft {
  const shared: CatalogDraft = {
    ...emptyDraft(),
    name: record.name,
    description: text(record.description),
    aliases: commaList(record.aliases),
  }

  if (type === 'camera') {
    const closeFocus = closeFocusParts(record.closeFocusMm as number | null)
    return {
      ...shared,
      maker: text(record.brand),
      bodyType: text(record.bodyType),
      frameFormat: text(record.frameFormat),
      ...formatParts(text(record.format)),
      year: text(record.year),
      defaultFilmStockId: text(record.defaultFilmStockId),
      lensName: text(record.lensName),
      focalMinMm: text(record.focalMinMm),
      focalMaxMm: text(record.focalMaxMm),
      apertureMaxWide: text(record.apertureMaxWide),
      apertureMaxTele: text(record.apertureMaxTele),
      lensElements: text(record.lensElements),
      lensGroups: text(record.lensGroups),
      closeFocus: closeFocus.value,
      closeFocusUnit: closeFocus.unit,
      focusType: text(record.focusType),
      meteringPattern: text(record.meteringPattern),
      exposureModes: Array.isArray(record.exposureModes) ? record.exposureModes.join(',') : '',
      shutterType: text(record.shutterType),
      // Shown in the notation the page prints, so the form and the page agree
      // about what "1/500" means.
      shutterSlowest: record.shutterSlowestSec ? shutterSpeedLabel(record.shutterSlowestSec as number) : '',
      shutterFastest: record.shutterFastestSec ? shutterSpeedLabel(record.shutterFastestSec as number) : '',
      filmSpeedMin: text(record.filmSpeedMin),
      filmSpeedMax: text(record.filmSpeedMax),
      flash: text(record.flash),
      batteryType: text(record.batteryType),
      weightGrams: text(record.weightGrams),
    }
  }

  return {
    ...shared,
    // The name on the box. The column is called `manufacturer` for historical
    // reasons and the page's Manufacturer row is a different pair of fields
    // below; see ADMIN_RESOURCES.films.editable.
    maker: text(record.manufacturer),
    ...formatParts(commaList(record.format)),
    iso: text(record.iso),
    // Offered as words, because that is what is printed on a box.
    process: filmProcessLabel(record.process as FilmProcess | null) ?? '',
    colorBalance: colorBalanceLabel(record.colorBalance as ColorBalance | null) ?? '',
    chromaticity: text(record.chromaticity),
    polarity: text(record.polarity),
    manufacturerStatus: text(record.manufacturerStatus),
    manufacturedByBrandId: text(record.manufacturedByBrandId),
    rmsGranularity: text(record.rmsGranularity),
    resolvingPowerLpmm: text(record.resolvingPowerLpmm),
    latitudeUnderStops: text(record.latitudeUnderStops),
    latitudeOverStops: text(record.latitudeOverStops),
    baseMaterial: text(record.baseMaterial),
    hasRemjet: record.hasRemjet === true ? 'true' : record.hasRemjet === false ? 'false' : '',
    parentStockId: text(record.parentStockId),
    respoolNotes: text(record.respoolNotes),
  }
}

/**
 * What the draft proposes, keyed by the name the server knows each field by.
 *
 * The one list. The add dialog posts it, the suggest-edit dialog builds it
 * twice — once from the record, once from the draft — and sends what differs,
 * and the allowlist on the far side is ADMIN_RESOURCES. A control whose key
 * is not in here is a question nobody collects the answer to, which is the
 * state the camera specs were in.
 *
 * Every field is present, blank ones included: that is what lets an emptied
 * control be told from an untouched one, so a wrong year can be removed and
 * not only overwritten.
 *
 * Units are converted here, at the one boundary, using the same helpers the
 * pages render through. A value that cannot be read is reported rather than
 * dropped — a form that silently discards "half a metre" is worse than one
 * that says it does not understand it.
 */
export function catalogFields(
  type: CatalogType,
  draft: CatalogDraft
): { fields: Record<string, string>; errors: string[] } {
  const fields: Record<string, string> = {}
  const errors: string[] = []
  const set = (field: string, value: string) => { fields[field] = value.trim() }

  /** A dial reading as seconds, or a complaint naming the control. */
  const seconds = (field: string, label: string, written: string) => {
    const value = written.trim()
    if (!value) return set(field, '')
    const parsed = parseShutterSeconds(value)
    if (parsed === null) errors.push(`${label} should read like 1/500 or 8s.`)
    else set(field, String(parsed))
  }

  set('name', draft.name)
  set('aliases', draft.aliases)
  set('format', resolvedFormat(draft))

  if (type === 'camera') {
    set('brand', draft.maker)
    set('bodyType', draft.bodyType)
    set('frameFormat', draft.frameFormat)
    set('year', draft.year)
    set('defaultFilmStockId', draft.defaultFilmStockId)

    set('lensName', draft.lensName)
    set('focalMinMm', draft.focalMinMm)
    set('focalMaxMm', draft.focalMaxMm)
    set('apertureMaxWide', draft.apertureMaxWide)
    set('apertureMaxTele', draft.apertureMaxTele)
    set('lensElements', draft.lensElements)
    set('lensGroups', draft.lensGroups)

    const distance = draft.closeFocus.trim()
    if (!distance) set('closeFocusMm', '')
    else {
      const mm = parseCloseFocusMm(distance, draft.closeFocusUnit)
      if (mm === null) errors.push('Closest focus should be a distance, like 60.')
      else set('closeFocusMm', String(mm))
    }

    set('focusType', draft.focusType)
    set('meteringPattern', draft.meteringPattern)
    set('exposureModes', draft.exposureModes)
    set('shutterType', draft.shutterType)
    seconds('shutterSlowestSec', 'Slowest shutter', draft.shutterSlowest)
    seconds('shutterFastestSec', 'Fastest shutter', draft.shutterFastest)
    set('filmSpeedMin', draft.filmSpeedMin)
    set('filmSpeedMax', draft.filmSpeedMax)

    set('flash', draft.flash)
    set('batteryType', draft.batteryType)
    set('weightGrams', draft.weightGrams)

    return { fields, errors }
  }

  set('manufacturer', draft.maker)
  set('iso', draft.iso)
  set('process', draft.process)
  set('colorBalance', draft.colorBalance)
  set('chromaticity', draft.chromaticity)
  set('polarity', draft.polarity)
  /*
    The two halves of the manufacturer claim, which the database couples:
    FilmStock_manufacturer_status_matches_column requires the company to be
    named for the two statuses that assert one and absent for the two that do
    not. The rule lived in a help sentence and nothing checked it, which was
    survivable while only an administrator could reach the fields.
  */
  const claimsAMaker =
    draft.manufacturerStatus === 'KNOWN' || draft.manufacturerStatus === 'ATTRIBUTED'
  const statusLabel = displayValue('manufacturerStatus', draft.manufacturerStatus)
  if (claimsAMaker && !draft.manufacturedByBrandId) {
    errors.push(`"${statusLabel}" needs the company named under Made by.`)
  }
  if (!claimsAMaker && draft.manufacturedByBrandId) {
    errors.push(`Made by only applies when the maker is ${displayValue('manufacturerStatus', 'KNOWN')} or ${displayValue('manufacturerStatus', 'ATTRIBUTED')}.`)
  }
  set('manufacturerStatus', draft.manufacturerStatus)
  set('manufacturedByBrandId', draft.manufacturedByBrandId)
  set('rmsGranularity', draft.rmsGranularity)
  set('resolvingPowerLpmm', draft.resolvingPowerLpmm)
  set('latitudeUnderStops', draft.latitudeUnderStops)
  set('latitudeOverStops', draft.latitudeOverStops)
  set('baseMaterial', draft.baseMaterial)
  set('hasRemjet', draft.hasRemjet)
  set('parentStockId', draft.parentStockId)
  set('respoolNotes', draft.respoolNotes)

  return { fields, errors }
}

/** A value a person actually supplied. */
function filled(value: string): boolean {
  return value.trim().length > 0
}

/**
 * Fields worth having that this draft has not filled, named the way the form
 * labels them.
 *
 * Shown as a nudge and never as a block. Somebody adding a camera so they can
 * tag the roll they just scanned should not be held at a form, but they are the
 * one person at that moment who knows what the thing is, and a list of what is
 * still blank is enough to get most of it. The two the schema genuinely
 * requires are validated separately and are not in here.
 */
export function worthAdding(type: CatalogType, draft: CatalogDraft): string[] {
  const missing: string[] = []

  if (!filled(draft.description)) missing.push('a description')

  if (type === 'camera') {
    if (!filled(draft.bodyType)) missing.push('body type')
    if (!filled(resolvedFormat(draft))) missing.push('format')
    // A disposable's year is rarely knowable and the form hides the field.
    if (draft.bodyType !== 'DISPOSABLE' && !filled(draft.year)) missing.push('year')
  } else {
    if (!filled(draft.iso)) missing.push('ISO')
    if (!filled(resolvedFormat(draft))) missing.push('format')
    // Frames per roll is not asked for: it belongs to a format rather than to
    // a stock, and the page says it once, in "Sold in".
  }

  return missing
}

/**
 * The description as paragraphs, with the summary line removed if it is still
 * the first one.
 *
 * The summary is derived from the description's opening line, so the two hold
 * the same sentence and the page was printing it twice: once as the lead and
 * again at the top of the prose below it. The writing standard's first rule
 * about these two fields is that the description never restates the summary.
 *
 * Removed at render rather than on save. Stripping it from the stored text
 * would mean the next edit derives its summary from whatever line came second,
 * so the entry would lose a sentence every time somebody corrected a typo.
 *
 * Splitting on any run of newlines rather than on a blank line only: people
 * press return once between paragraphs at least as often as twice, and the
 * blank-line rule rendered those as a single run-on block.
 */
export function descriptionParagraphs(
  description: string | null | undefined,
  summary: string | null | undefined
): string[] {
  const text = (description ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return []

  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean)
  if (summary && paragraphs[0] === summary.trim()) paragraphs.shift()
  return paragraphs
}
