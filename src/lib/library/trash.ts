import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/db'
import { discardStoredKeys } from '@/lib/oss'
import { storedKeys } from '@/lib/photoStorage'
import { PHOTO_FILE_KEYS } from '@/lib/photoVisibilityChange'
import { refreshPublicCards } from '@/lib/seo/profileCard'

/**
 * The Trash. Deleting a photo from the library sets `deletedAt`: it leaves
 * every listing at once (PUBLIC_PHOTO and visibleToViewer exclude it), keeps
 * its roll and album places, and can be restored for TRASH_DAYS. After that,
 * or when the owner empties the Trash, it is purged: the row, every stored
 * file, original included, and the copies in the server's media mirror.
 */
export const TRASH_DAYS = 30

/** The server's copy of the bucket, kept by avoidxray-media-sync. */
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/var/lib/avoidxray/media'

/** Moves the owner's photos to the Trash. Returns how many moved. */
export async function trashPhotos(ownerId: string, ids: string[]): Promise<number> {
  const { count } = await prisma.photo.updateMany({
    where: { id: { in: ids }, userId: ownerId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  // Their cards and counts on public pages go with them. Their files move to
  // private addresses too (photoStorage.ts treats the Trash as private): the
  // caller schedules that after its response, as a visibility change does.
  if (count) await refreshPublicCards([ownerId])
  return count
}

/** Takes the owner's photos out of the Trash, back where they were. */
export async function restorePhotos(ownerId: string, ids: string[]): Promise<number> {
  const { count } = await prisma.photo.updateMany({
    where: { id: { in: ids }, userId: ownerId, deletedAt: { not: null } },
    data: { deletedAt: null },
  })
  if (count) await refreshPublicCards([ownerId])
  return count
}

/**
 * Deletes trashed photos for good: rows first, then the files of the rows that
 * went, in the bucket and in the mirror. Rolls left with nothing in them are
 * deleted too. `where` narrows it to an owner and ids, or to everything past
 * its time.
 */
export async function purgeTrashed(where: { ownerId?: string; ids?: string[]; deletedBefore?: Date }): Promise<number> {
  const photos = await prisma.photo.findMany({
    where: {
      deletedAt: where.deletedBefore ? { lt: where.deletedBefore } : { not: null },
      ...(where.ownerId ? { userId: where.ownerId } : {}),
      ...(where.ids ? { id: { in: where.ids } } : {}),
    },
    select: { id: true, rollId: true, ...PHOTO_FILE_KEYS },
    take: 500,
  })
  if (!photos.length) return 0

  // Only rows still in the Trash: a restore that raced this one wins.
  // The hourly purge spans owners, so the owner is only named when one is given.
  const { count } = await prisma.photo.deleteMany({
    where: { id: { in: photos.map(p => p.id) }, deletedAt: { not: null }, userId: where.ownerId },
  })
  const gone = new Set((await prisma.photo.findMany({ where: { id: { in: photos.map(p => p.id) } }, select: { id: true } })).map(p => p.id))
  const purged = photos.filter(p => !gone.has(p.id))
  for (const photo of purged) {
    const keys = storedKeys(photo)
    await discardStoredKeys(keys, 'trash purge')
    await Promise.all(keys.map(removeMirrored))
  }

  const rollIds = [...new Set(purged.flatMap(p => (p.rollId ? [p.rollId] : [])))]
  if (rollIds.length) {
    await prisma.roll.deleteMany({ where: { id: { in: rollIds }, photos: { none: {} }, importItems: { none: {} } } })
  }
  return count
}

/** Deletes the mirror's copy of an object, if it has one. */
async function removeMirrored(key: string) {
  const file = path.resolve(MEDIA_ROOT, key)
  if (!file.startsWith(path.resolve(MEDIA_ROOT) + path.sep)) return
  await unlink(file).catch(() => {})
}

/** For the hourly cleanup: purges what has been in the Trash for TRASH_DAYS. */
export function purgeExpiredTrash(): Promise<number> {
  return purgeTrashed({ deletedBefore: new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000) })
}
