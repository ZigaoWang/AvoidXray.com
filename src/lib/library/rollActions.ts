import { prisma } from '@/lib/db'

/**
 * Moving photos between rolls, merging rolls and ordering frames. A photo
 * takes the details of the roll it joins (`Photo_follows_roll`); a photo made
 * loose keeps the details it had.
 */

/** Where moved photos go: a roll, a new roll, or no roll. */
export type MoveTarget = { rollId: string } | { newRoll: { title: string | null; copyFrom: string | null } } | { loose: true }

/** The owner's photos, in their current frame order, then upload order. */
async function ownedInOrder(ownerId: string, ids: string[]) {
  return prisma.photo.findMany({
    where: { id: { in: ids }, userId: ownerId, kind: 'COMMUNITY' },
    select: { id: true },
    orderBy: [{ rollId: 'asc' }, { rollPosition: 'asc' }, { createdAt: 'asc' }],
  })
}

/**
 * Moves photos, appended after the target roll's last frame in the order they
 * were in. A new roll copies the details of `copyFrom` when given, as when a
 * roll is split. Returns the roll moved to, or null for loose.
 */
export async function movePhotos(ownerId: string, ids: string[], target: MoveTarget): Promise<string | null> {
  const photos = await ownedInOrder(ownerId, ids)
  if (!photos.length) return null
  return prisma.$transaction(async tx => {
    let rollId: string | null = null
    if ('rollId' in target) {
      const roll = await tx.roll.findFirst({ where: { id: target.rollId, ownerId }, select: { id: true } })
      if (!roll) throw new RollNotFound()
      rollId = roll.id
    } else if ('newRoll' in target) {
      const source = target.newRoll.copyFrom
        ? await tx.roll.findFirst({
          where: { id: target.newRoll.copyFrom, ownerId },
          select: {
            filmStockId: true, cameraId: true, labId: true, scannerModel: true, shotFrom: true, shotFromPrecision: true,
            shotTo: true, shotToPrecision: true, developedAt: true, developedAtPrecision: true, location: true, ei: true, notes: true,
          },
        })
        : null
      rollId = (await tx.roll.create({ data: { ...(source ?? {}), ownerId, title: target.newRoll.title }, select: { id: true } })).id
    }
    const last = rollId
      ? (await tx.photo.aggregate({ where: { rollId, id: { notIn: photos.map(p => p.id) } }, _max: { rollPosition: true } }))._max.rollPosition ?? 0
      : 0
    for (const [i, photo] of photos.entries()) {
      await tx.photo.update({ where: { id: photo.id }, data: { rollId, rollPosition: rollId ? last + i + 1 : null } })
    }
    return rollId
  })
}

/** Puts every photo of one roll after another's, and deletes the emptied roll. */
export async function mergeRolls(ownerId: string, fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) return
  const [from, into] = await Promise.all([
    prisma.roll.findFirst({ where: { id: fromId, ownerId }, select: { id: true } }),
    prisma.roll.findFirst({ where: { id: intoId, ownerId }, select: { id: true } }),
  ])
  if (!from || !into) throw new RollNotFound()
  const photos = await prisma.photo.findMany({ where: { rollId: fromId }, select: { id: true } })
  if (photos.length) await movePhotos(ownerId, photos.map(p => p.id), { rollId: intoId })
  await prisma.importItem.updateMany({ where: { rollId: fromId, userId: ownerId }, data: { rollId: intoId } })
  await prisma.roll.deleteMany({ where: { id: fromId, ownerId, photos: { none: {} } } })
}

/**
 * Numbers a roll's frames in the order given. Photos of the roll not named,
 * such as ones in the Trash, keep their order after them.
 */
export async function reorderRoll(ownerId: string, rollId: string, photoIds: string[]): Promise<void> {
  const roll = await prisma.roll.findFirst({ where: { id: rollId, ownerId }, select: { id: true } })
  if (!roll) throw new RollNotFound()
  const inRoll = await prisma.photo.findMany({
    where: { rollId },
    select: { id: true },
    orderBy: [{ rollPosition: 'asc' }, { createdAt: 'asc' }],
  })
  const named = photoIds.filter(id => inRoll.some(p => p.id === id))
  const rest = inRoll.map(p => p.id).filter(id => !named.includes(id))
  await prisma.$transaction([...named, ...rest].map((id, i) =>
    prisma.photo.update({ where: { id }, data: { rollPosition: i + 1 } })))
}

export class RollNotFound extends Error {}
