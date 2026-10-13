import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenFilter } from '@/lib/blocks'

/**
 * The photographs shown under one photograph.
 *
 * The strip used to be a single query for "same film OR same camera, newest
 * first, take four". Three things were wrong with that.
 *
 * A frame sharing both the film and the camera ranked no higher than one
 * sharing only the camera body, so the closest matches were usually not the
 * ones shown. Ordering by date alone meant the same four recent uploads
 * appeared under every photograph on that stock, so browsing a film went in a
 * circle. And nothing capped one photographer, so a single person's roll could
 * take the whole strip.
 *
 * Closeness first, then recency, then a limit of two frames per photographer
 * so the strip is a way into other people's work rather than more of one
 * person's.
 */

/** Tiles in the strip: two rows of four on a desktop, four rows of two on a phone. */
const RELATED_COUNT = 8

/** Frames from any one photographer, before the rest are passed over. */
const PER_PHOTOGRAPHER = 2

const RELATED_SELECT = {
  id: true,
  thumbnailPath: true,
  blurHash: true,
  caption: true,
  filmStock: { select: { name: true, brand: true } },
  camera: { select: { name: true, brand: true } },
  user: { select: { name: true, username: true } },
} as const satisfies Prisma.PhotoSelect

/** One tile's worth of photograph. */
export type RelatedPhoto = Prisma.PhotoGetPayload<{ select: typeof RELATED_SELECT }>

export async function relatedPhotos(
  photo: { id: string; filmStockId: string | null; cameraId: string | null },
  blockedIds: string[]
): Promise<RelatedPhoto[]> {
  const { filmStockId, cameraId } = photo
  if (!filmStockId && !cameraId) return []

  const base = {
    id: { not: photo.id },
    ...PUBLIC_PHOTO,
    // Already loaded for the prev/next navigation. Without it a blocked
    // account's work reappears under every photo sharing its film or camera.
    ...hiddenFilter(blockedIds),
  }

  // Three tiers, asked for at once rather than in sequence. Each is indexed on
  // the column it filters, and each takes more than the strip needs so that
  // dropping a photographer's third frame does not leave a hole.
  const overfetch = RELATED_COUNT * 3
  const [both, sameFilm, sameCamera] = await Promise.all([
    filmStockId && cameraId
      ? prisma.photo.findMany({
          where: { ...base, filmStockId, cameraId },
          take: overfetch,
          orderBy: { createdAt: 'desc' },
          select: RELATED_SELECT,
        })
      : [],
    filmStockId
      ? prisma.photo.findMany({
          where: { ...base, filmStockId },
          take: overfetch,
          orderBy: { createdAt: 'desc' },
          select: RELATED_SELECT,
        })
      : [],
    cameraId
      ? prisma.photo.findMany({
          where: { ...base, cameraId },
          take: overfetch,
          orderBy: { createdAt: 'desc' },
          select: RELATED_SELECT,
        })
      : [],
  ])

  const picked: RelatedPhoto[] = []
  const seen = new Set<string>()
  const perUser = new Map<string, number>()
  // Frames set aside by the per-photographer cap, used to fill the strip
  // rather than showing three tiles because one person shot the rest.
  const overflow: RelatedPhoto[] = []

  for (const candidate of [...both, ...sameFilm, ...sameCamera]) {
    if (seen.has(candidate.id)) continue
    seen.add(candidate.id)

    const username = candidate.user.username
    const count = perUser.get(username) ?? 0
    if (count >= PER_PHOTOGRAPHER) {
      overflow.push(candidate)
      continue
    }
    perUser.set(username, count + 1)
    picked.push(candidate)
    if (picked.length === RELATED_COUNT) return picked
  }

  return [...picked, ...overflow].slice(0, RELATED_COUNT)
}

/** Tiles in the photographer's strip: one row on a desktop. */
const BY_PHOTOGRAPHER_COUNT = 4

/**
 * The photographer's other recent work, under one of their photographs.
 *
 * The strip above is deliberately other people's. Someone who liked this frame
 * often wants the rest of the roll, which meant leaving for the profile.
 */
export async function morePhotosByPhotographer(photo: { id: string; userId: string }): Promise<RelatedPhoto[]> {
  return prisma.photo.findMany({
    where: { userId: photo.userId, id: { not: photo.id }, ...PUBLIC_PHOTO },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: BY_PHOTOGRAPHER_COUNT,
    select: RELATED_SELECT,
  })
}

/**
 * A fresh mix of recent public photos from the given photographers, or from
 * everyone when none are given, for the signed-in home page.
 *
 * It was the newest eight, which is usually one person's latest roll, and
 * the same eight on every visit until someone posted again. It now draws from
 * a pool ten times the size of the row, shuffles it on each visit, and caps
 * any one photographer at their fair share of the row, so a single big upload
 * cannot fill it while there are others to show.
 */
export async function recentMix({
  fromUserIds,
  hidden,
  take,
}: {
  fromUserIds?: string[]
  hidden: string[]
  take: number
}): Promise<RelatedPhoto[]> {
  const pool = await prisma.photo.findMany({
    where: {
      ...PUBLIC_PHOTO,
      ...hiddenFilter(hidden),
      ...(fromUserIds ? { userId: { in: fromUserIds } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take * 10,
    select: RELATED_SELECT,
  })

  // Fisher-Yates, so every visit draws a different row.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const photographers = new Set(pool.map(p => p.user.username)).size
  const cap = Math.max(PER_PHOTOGRAPHER, Math.ceil(take / Math.max(1, photographers)))
  const picked: RelatedPhoto[] = []
  const overflow: RelatedPhoto[] = []
  const perPerson = new Map<string, number>()
  for (const photo of pool) {
    const count = perPerson.get(photo.user.username) ?? 0
    if (count >= cap) {
      overflow.push(photo)
      continue
    }
    perPerson.set(photo.user.username, count + 1)
    picked.push(photo)
    if (picked.length === take) return picked
  }
  return [...picked, ...overflow].slice(0, take)
}
