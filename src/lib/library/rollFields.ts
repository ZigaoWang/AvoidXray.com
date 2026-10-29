import type { DatePrecision, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { blockedWordsMessage, hasBlockedWords } from '@/lib/wordFilter'

/**
 * A roll's details as the import page and the library send them, checked and
 * turned into columns. Every field is optional; a field left out is left
 * alone, and null clears it.
 *
 * Dates are "YYYY-MM" for a month or "YYYY-MM-DD" for a day, as the owner
 * typed them. A month is stored as its 1st with the precision saying so.
 */
export interface RollDetailsInput {
  title?: string | null
  filmStockId?: string | null
  cameraId?: string | null
  labId?: string | null
  scannerModel?: string | null
  shotFrom?: string | null
  shotTo?: string | null
  developedAt?: string | null
  location?: string | null
  ei?: number | null
  notes?: string | null
}

const TEXT_LIMITS = { title: 120, scannerModel: 100, location: 200, notes: 2000 } as const

/** "2026-03" or "2026-03-14", as a date and how much of it was given. */
export function parseRollDate(value: string): { date: Date; precision: DatePrecision } | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = d ? Number(d) : 1
  const date = new Date(Date.UTC(year, month - 1, day))
  if (year < 1826 || month < 1 || month > 12 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null
  return { date, precision: d ? 'DAY' : 'MONTH' }
}

/** A stored date back in the form it was given. */
export function formatRollDate(date: Date | null, precision: DatePrecision | null): string | null {
  if (!date) return null
  const iso = date.toISOString().slice(0, 10)
  return precision === 'MONTH' ? iso.slice(0, 7) : iso
}

/**
 * Checks the details and returns the columns to write, or what is wrong.
 * Catalog ids are checked to exist.
 */
export async function rollDetailsData(
  input: RollDetailsInput,
): Promise<{ data: Prisma.RollUncheckedUpdateInput } | { error: string }> {
  const data: Prisma.RollUncheckedUpdateInput = {}

  for (const field of ['title', 'scannerModel', 'location', 'notes'] as const) {
    const value = input[field]
    if (value === undefined) continue
    if (value === null || value.trim() === '') { data[field] = null; continue }
    if (typeof value !== 'string') return { error: `Invalid ${field}` }
    const text = value.trim()
    if (text.length > TEXT_LIMITS[field]) return { error: `Keep the ${fieldName(field)} under ${TEXT_LIMITS[field]} characters` }
    if (hasBlockedWords(text, 'text')) return { error: blockedWordsMessage(`The ${fieldName(field)}`) }
    data[field] = text
  }

  for (const [field, precisionField] of [
    ['shotFrom', 'shotFromPrecision'], ['shotTo', 'shotToPrecision'], ['developedAt', 'developedAtPrecision'],
  ] as const) {
    const value = input[field]
    if (value === undefined) continue
    if (value === null || value === '') { data[field] = null; data[precisionField] = null; continue }
    const parsed = typeof value === 'string' ? parseRollDate(value) : null
    if (!parsed) return { error: `${fieldName(field)[0].toUpperCase()}${fieldName(field).slice(1)} should be a month or a day, not in the future` }
    data[field] = parsed.date
    data[precisionField] = parsed.precision
  }

  if (input.ei !== undefined) {
    if (input.ei === null) data.ei = null
    else if (!Number.isInteger(input.ei) || input.ei < 1 || input.ei > 100000) return { error: 'EI should be a whole number' }
    else data.ei = input.ei
  }

  const catalog = [
    ['filmStockId', (id: string) => prisma.filmStock.count({ where: { id } }), 'film stock'],
    ['cameraId', (id: string) => prisma.camera.count({ where: { id } }), 'camera'],
    ['labId', (id: string) => prisma.lab.count({ where: { id } }), 'lab'],
  ] as const
  for (const [field, exists, name] of catalog) {
    const value = input[field]
    if (value === undefined) continue
    if (value === null) { data[field] = null; continue }
    if (typeof value !== 'string' || !(await exists(value))) return { error: `That ${name} is not in the catalog` }
    data[field] = value
  }

  return { data }
}

function fieldName(field: string): string {
  return {
    title: 'title', scannerModel: 'scanner', location: 'location', notes: 'notes',
    shotFrom: 'shot date', shotTo: 'shot date', developedAt: 'developed date',
  }[field] ?? field
}

/** A roll as the import page and library read it. */
export const ROLL_SELECT = {
  id: true, title: true, filmStockId: true, cameraId: true, labId: true, scannerModel: true,
  shotFrom: true, shotFromPrecision: true, shotTo: true, shotToPrecision: true,
  developedAt: true, developedAtPrecision: true, location: true, ei: true, notes: true,
} as const

export function rollView(roll: Prisma.RollGetPayload<{ select: typeof ROLL_SELECT }>) {
  return {
    id: roll.id,
    title: roll.title,
    filmStockId: roll.filmStockId,
    cameraId: roll.cameraId,
    labId: roll.labId,
    scannerModel: roll.scannerModel,
    shotFrom: formatRollDate(roll.shotFrom, roll.shotFromPrecision),
    shotTo: formatRollDate(roll.shotTo, roll.shotToPrecision),
    developedAt: formatRollDate(roll.developedAt, roll.developedAtPrecision),
    location: roll.location,
    ei: roll.ei,
    notes: roll.notes,
  }
}
