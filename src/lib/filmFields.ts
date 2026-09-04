/**
 * Derivation and normalization for the film stock fields.
 *
 * Shared by the backfill and by the create/update routes, so a row written by
 * hand and a row written by the API end up in the same shape.
 */

export const FILM_PROCESSES = ['C-41', 'E-6', 'ECN-2', 'B&W', 'Other'] as const
export type FilmProcessValue = (typeof FILM_PROCESSES)[number]

export const COLOR_BALANCES = ['Daylight', 'Tungsten', 'N/A'] as const
export type ColorBalanceValue = (typeof COLOR_BALANCES)[number]

export const FILM_FORMATS = ['35mm', '120', '220', '110', '4x5', '8x10', 'Instant', 'Half-frame'] as const

/**
 * Known manufacturers in their canonical casing.
 *
 * Matched against the start of a stock's name, longest first so "Lomography"
 * wins over a shorter prefix that also matches. The canonical spelling is what
 * gets stored, which is what stops "KODAK", "kodak" and "Kodak" becoming three
 * different manufacturers in a filter list.
 */
const KNOWN_MANUFACTURERS = [
  'Kodak',
  'Fujifilm',
  'Ilford',
  'Cinestill',
  'Lomography',
  'Harman',
  'Orwo',
  'Ferrania',
  'Adox',
  'Rollei',
  'Foma',
  'Agfa',
  'Polaroid',
  'Bergger',
  'Shanghai',
  'Lucky',
  'Kentmere',
] as const

/**
 * Brand names that appear in product names but are not the manufacturer.
 * "Fujicolor 400" is made by Fujifilm; "LomoChrome" is Lomography.
 */
const NAME_PREFIX_ALIASES: Record<string, string> = {
  fujicolor: 'Fujifilm',
  fuji: 'Fujifilm',
  lomochrome: 'Lomography',
  ilfocolor: 'Ilford',
  ilfochrome: 'Ilford',
  kentmere: 'Harman',
}

/**
 * Canonical casing for a manufacturer the user typed.
 *
 * Matches a known manufacturer case-insensitively and returns its canonical
 * form; otherwise title-cases the input so free-text entries are at least
 * consistent with each other.
 */
export function normalizeManufacturer(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  const known = KNOWN_MANUFACTURERS.find((m) => m.toLowerCase() === lower)
  if (known) return known
  if (NAME_PREFIX_ALIASES[lower]) return NAME_PREFIX_ALIASES[lower]

  // A company written out in full: "Lucky Film (乐凯)", "Harman Technology",
  // "Film Ferrania", "Kodak Alaris". Stored whole, it gets pasted in front of
  // a product name that already carries the brand, giving "Lucky Film (乐凯)
  // Lucky Color 400". Reduced to the brand only when a word of it is one we
  // recognise, so an unfamiliar maker is left exactly as typed rather than
  // guessed at.
  const words = trimmed
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
  if (words.length > 1 || trimmed.includes('(')) {
    for (const word of words) {
      const w = word.toLowerCase().replace(/[^a-z0-9]/g, '')
      const match = KNOWN_MANUFACTURERS.find((m) => m.toLowerCase() === w)
      if (match) return match
      if (NAME_PREFIX_ALIASES[w]) return NAME_PREFIX_ALIASES[w]
    }
  }

  // Title case, preserving internal capitals people mean (e.g. "ORWO" -> "Orwo",
  // but "AgfaPhoto" keeps its shape because it is not all-caps).
  if (trimmed === trimmed.toUpperCase()) {
    return trimmed.charAt(0) + trimmed.slice(1).toLowerCase()
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/**
 * Best guess at the manufacturer from a stock's name.
 *
 * Returns null rather than guessing when nothing matches, so the caller can
 * report the row instead of writing something wrong into a required field.
 */
export function inferManufacturer(name: string): string | null {
  const lower = name.toLowerCase()

  for (const prefix of Object.keys(NAME_PREFIX_ALIASES).sort((a, b) => b.length - a.length)) {
    if (lower.startsWith(prefix)) return NAME_PREFIX_ALIASES[prefix]
  }

  const sorted = [...KNOWN_MANUFACTURERS].sort((a, b) => b.length - a.length)
  for (const manufacturer of sorted) {
    if (lower.startsWith(manufacturer.toLowerCase())) return manufacturer
  }

  return null
}

export interface ProcessInference {
  process: FilmProcessValue | null
  colorBalance: ColorBalanceValue | null
  /** Why this needs a human, if it does. */
  note?: string
}

/**
 * Derive process and color balance from the existing free-text film type.
 *
 * The mapping requested was: color negative to C-41, color reversal to E-6,
 * black and white to B&W with a color balance of N/A.
 *
 * Two refinements, both of which report rather than decide:
 *   - A stock of motion picture origin may develop in ECN-2 or, if the remjet
 *     has been removed for still use, in C-41. Kodak VISION3 and CineStill are
 *     both in this position and they differ. The plain rule would write C-41
 *     for all of them, so they are flagged rather than assumed either way.
 *   - Color balance is only certain for black and white. A tungsten-balanced
 *     stock usually says so, but inferring it from a name is guesswork, so
 *     anything suggestive is reported and left null.
 */
export function inferProcessFields(film: {
  name: string
  filmType: string | null
  description: string | null
}): ProcessInference {
  const type = (film.filmType ?? '').toLowerCase()
  const haystack = `${film.name} ${film.description ?? ''}`.toLowerCase()

  const looksCine =
    /\becn-?2\b/.test(haystack) ||
    /\bvision\s?3\b/.test(haystack) ||
    /motion picture/.test(haystack) ||
    /\bcine(ma)?\b/.test(haystack)

  if (/black\s*(&|and)?\s*white|b\s*&\s*w|monochrome/.test(type)) {
    return { process: 'B&W', colorBalance: 'N/A' }
  }

  if (/reversal|slide|transparency/.test(type)) {
    return { process: 'E-6', colorBalance: null, note: 'color balance needs confirming' }
  }

  if (/negative/.test(type)) {
    if (looksCine) {
      return {
        process: null,
        colorBalance: null,
        note: 'motion picture origin — ECN-2, or C-41 if the remjet is removed',
      }
    }
    const tungsten = /tungsten|\b\d{3,4}t\b|3200k/.test(haystack)
    return {
      process: 'C-41',
      colorBalance: null,
      note: tungsten ? 'reads as tungsten balanced' : 'color negative — usually Daylight',
    }
  }

  return { process: null, colorBalance: null, note: `unrecognized film type ${film.filmType ?? '(none)'}` }
}

/**
 * Product codes worth carrying as aliases, taken from a parenthesised suffix.
 * "Kodak Vision3 500T (5219)" yields "5219", which is how people search for it.
 */
export function inferAliases(name: string): string[] {
  const aliases = new Set<string>()
  for (const match of name.matchAll(/\(([^)]+)\)/g)) {
    for (const part of match[1].split(/[,/]/)) {
      const value = part.trim()
      if (value && value.length <= 24) aliases.add(value)
    }
  }
  return [...aliases]
}

/**
 * A starting point for a stock's chromaticity and polarity.
 *
 * A **default**, not a derivation. The two axes are independent of `process` —
 * that is the whole reason they are separate columns — so this exists only to
 * give a new record sensible values that a person can then correct. Nothing
 * should call this to *answer* the question about an existing row.
 *
 * The case it gets wrong, by construction, is the case that motivated the
 * split: Ilford XP2 Super is monochrome and develops in C-41, so this proposes
 * COLOR for it and a human has to say otherwise.
 */
export function defaultFilmAxes(
  process: FilmProcess | null,
  filmType: string | null
): { chromaticity: Chromaticity; polarity: Polarity } {
  const type = (filmType ?? '').toLowerCase()

  // The submitted film type is the better signal where it exists, because it
  // is the one field that already spoke about appearance rather than chemistry.
  if (/black\s*(&|and)?\s*white|b\s*&\s*w|monochrome/.test(type)) {
    return { chromaticity: 'MONOCHROME', polarity: 'NEGATIVE' }
  }
  if (/instant/.test(type)) {
    return { chromaticity: 'COLOR', polarity: 'DIRECT_POSITIVE' }
  }
  if (/slide|reversal|transparency/.test(type)) {
    return { chromaticity: 'COLOR', polarity: 'POSITIVE' }
  }

  // Otherwise fall back to the process, which is a weaker signal.
  if (process === 'BW') return { chromaticity: 'MONOCHROME', polarity: 'NEGATIVE' }
  if (process === 'E6') return { chromaticity: 'COLOR', polarity: 'POSITIVE' }
  return { chromaticity: 'COLOR', polarity: 'NEGATIVE' }
}

/** Trim, drop blanks, and de-duplicate case-insensitively, preserving order. */
export function normalizeAliases(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const value = raw.trim().replace(/\s+/g, ' ')
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

// ── Enum conversion ──────────────────────────────────────────────────────────
//
// The database stores display strings ('C-41'); Prisma exposes identifiers it
// can legally name ('C41'). These convert between the two so the rest of the
// code can deal in the values people actually read.

import type { Chromaticity, ColorBalance, FilmProcess, Polarity } from '@prisma/client'

const PROCESS_TO_ENUM: Record<FilmProcessValue, FilmProcess> = {
  'C-41': 'C41',
  'E-6': 'E6',
  'ECN-2': 'ECN2',
  'B&W': 'BW',
  Other: 'OTHER',
}
const PROCESS_TO_LABEL: Record<FilmProcess, FilmProcessValue> = {
  C41: 'C-41',
  E6: 'E-6',
  ECN2: 'ECN-2',
  BW: 'B&W',
  OTHER: 'Other',
}

const BALANCE_TO_ENUM: Record<ColorBalanceValue, ColorBalance> = {
  Daylight: 'DAYLIGHT',
  Tungsten: 'TUNGSTEN',
  'N/A': 'NA',
}
const BALANCE_TO_LABEL: Record<ColorBalance, ColorBalanceValue> = {
  DAYLIGHT: 'Daylight',
  TUNGSTEN: 'Tungsten',
  NA: 'N/A',
}

/** Accepts either the display value or the enum member; null if neither. */
export function toFilmProcess(input: string | null | undefined): FilmProcess | null {
  if (!input) return null
  const label = FILM_PROCESSES.find((p) => p.toLowerCase() === input.toLowerCase())
  if (label) return PROCESS_TO_ENUM[label]
  return input.toUpperCase() in PROCESS_TO_LABEL ? (input.toUpperCase() as FilmProcess) : null
}

export function toColorBalance(input: string | null | undefined): ColorBalance | null {
  if (!input) return null
  const label = COLOR_BALANCES.find((b) => b.toLowerCase() === input.toLowerCase())
  if (label) return BALANCE_TO_ENUM[label]
  return input.toUpperCase() in BALANCE_TO_LABEL ? (input.toUpperCase() as ColorBalance) : null
}

export function filmProcessLabel(value: FilmProcess | null | undefined): string | null {
  return value ? PROCESS_TO_LABEL[value] : null
}

export function colorBalanceLabel(value: ColorBalance | null | undefined): string | null {
  return value ? BALANCE_TO_LABEL[value] : null
}
