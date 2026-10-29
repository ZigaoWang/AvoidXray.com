import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { blockedWordsMessage, hasBlockedWords } from '@/lib/wordFilter'

/**
 * Details a photo holds for itself. Film, camera and lab belong to the roll
 * for a photo in one, and are only written on loose photos; the caption and
 * the date are the photo's own wherever it is.
 */
export interface PhotoDetailsInput {
  caption?: string | null
  takenDate?: string | null
  filmStockId?: string | null
  cameraId?: string | null
  labId?: string | null
}

const CAPTION_MAX = 2000

/** Checks the input and returns the columns to write, split by who may take them. */
export async function photoDetailsData(input: PhotoDetailsInput): Promise<
  { own: Prisma.PhotoUncheckedUpdateManyInput; gear: Prisma.PhotoUncheckedUpdateManyInput } | { error: string }
> {
  const own: Prisma.PhotoUncheckedUpdateManyInput = {}
  const gear: Prisma.PhotoUncheckedUpdateManyInput = {}

  if (input.caption !== undefined) {
    const caption = typeof input.caption === 'string' ? input.caption.trim() : ''
    if (caption.length > CAPTION_MAX) return { error: `Keep the caption under ${CAPTION_MAX} characters` }
    if (caption && hasBlockedWords(caption, 'text')) return { error: blockedWordsMessage('The caption') }
    own.caption = caption || null
  }
  if (input.takenDate !== undefined) {
    if (input.takenDate === null || input.takenDate === '') own.takenDate = null
    else {
      const match = typeof input.takenDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.takenDate)
      const date = match ? new Date(`${input.takenDate}T00:00:00Z`) : null
      if (!date || Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86400000) return { error: 'The date is not a valid day' }
      own.takenDate = date
    }
  }
  const catalog = [
    ['filmStockId', (id: string) => prisma.filmStock.count({ where: { id } }), 'film stock'],
    ['cameraId', (id: string) => prisma.camera.count({ where: { id } }), 'camera'],
    ['labId', (id: string) => prisma.lab.count({ where: { id } }), 'lab'],
  ] as const
  for (const [field, exists, name] of catalog) {
    const value = input[field]
    if (value === undefined) continue
    if (value === null || value === '') { gear[field] = null; continue }
    if (typeof value !== 'string' || !(await exists(value))) return { error: `That ${name} is not in the catalog` }
    gear[field] = value
  }
  return { own, gear }
}

/**
 * Writes details on the owner's photos. Film, camera and lab land on the loose
 * ones only; the answer says how many in rolls were left, so the page can
 * point at the roll's own details.
 */
export async function applyPhotoDetails(ownerId: string, ids: string[], input: PhotoDetailsInput) {
  const checked = await photoDetailsData(input)
  if ('error' in checked) return checked
  const [ownResult, gearResult, inRolls] = await Promise.all([
    Object.keys(checked.own).length
      ? prisma.photo.updateMany({ where: { id: { in: ids }, userId: ownerId, kind: 'COMMUNITY' }, data: checked.own })
      : null,
    Object.keys(checked.gear).length
      ? prisma.photo.updateMany({ where: { id: { in: ids }, userId: ownerId, kind: 'COMMUNITY', rollId: null }, data: checked.gear })
      : null,
    Object.keys(checked.gear).length
      ? prisma.photo.count({ where: { id: { in: ids }, userId: ownerId, kind: 'COMMUNITY', rollId: { not: null } } })
      : 0,
  ])
  return { updated: Math.max(ownResult?.count ?? 0, gearResult?.count ?? 0), keptByRoll: inRolls }
}
