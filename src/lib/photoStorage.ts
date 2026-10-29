import { createHash, randomUUID } from 'node:crypto'
import { prisma } from './db'
import { copyInOSS, deleteFromOSS, publicObjectUrl, setObjectAccess } from './oss'

/**
 * Where a community photo's files live, and who can read them.
 *
 * The original is always private and only its owner ever gets an address for
 * it. The display versions (thumb, medium, large) are public while the photo
 * is published and private otherwise. A private file is read through
 * /api/photos/[id]/image/[variant], which checks the viewer and redirects to
 * a short-lived signed address, so a page can render any photo's stored path
 * without knowing which kind it is.
 *
 * Keys are random and unrelated to the photo id. Making a photo private moves
 * its display versions to new keys rather than only changing their access:
 * anyone who saw the photo while it was published may still hold the old
 * address, and a browser, a crawler or the image optimizer may have kept a
 * copy under it. A new key is the guarantee; purging caches would only be a
 * hope.
 */

export type PhotoVariant = 'thumb' | 'medium' | 'large' | 'original'

export const DISPLAY_VARIANTS = ['thumb', 'medium', 'large'] as const satisfies readonly PhotoVariant[]

const PREFIX: Record<PhotoVariant, string> = {
  original: 'originals',
  thumb: 'thumbs',
  medium: 'medium',
  large: 'large',
}

/** The storage prefixes photo files are written under, for the orphan sweep and the optimizer's allowlist. */
export const PHOTO_PREFIXES = Object.values(PREFIX)

/** A new random key for one version of a photo. */
export function newPhotoKey(variant: PhotoVariant, ext: string): string {
  return `${PREFIX[variant]}/${randomUUID()}.${ext}`
}

function extensionOf(key: string): string {
  return key.slice(key.lastIndexOf('.') + 1)
}

/**
 * The route a page loads a private version from.
 *
 * `v` changes whenever the key does, so a browser that cached the redirect for
 * an older key asks again. It is a hash rather than the key itself: the route
 * is shown only to people allowed to see the photo, but there is no reason to
 * put a storage address in a page.
 */
export function privateImagePath(photoId: string, variant: PhotoVariant, key: string): string {
  const v = createHash('sha256').update(key).digest('hex').slice(0, 12)
  return `/api/photos/${encodeURIComponent(photoId)}/image/${variant}?v=${v}`
}

export interface PhotoKeys {
  id: string
  originalKey: string | null
  thumbKey: string
  mediumKey: string
  largeKey: string | null
}

/** What the path columns should hold for these keys at this access. */
export function storedPaths(photo: PhotoKeys, imagesPublic: boolean) {
  const display = (variant: PhotoVariant, key: string) =>
    imagesPublic ? publicObjectUrl(key) : privateImagePath(photo.id, variant, key)
  return {
    thumbnailPath: display('thumb', photo.thumbKey),
    mediumPath: display('medium', photo.mediumKey),
    largePath: photo.largeKey ? display('large', photo.largeKey) : null,
    ...(photo.originalKey ? { originalPath: privateImagePath(photo.id, 'original', photo.originalKey) } : {}),
  }
}

/** Every object a photo row accounts for, for deleting it. */
export function storedKeys(photo: Omit<PhotoKeys, 'id'>): string[] {
  return [photo.originalKey, photo.thumbKey, photo.mediumKey, photo.largeKey].filter((k): k is string => !!k)
}

const STORAGE_SELECT = {
  id: true, kind: true, visibility: true, imagesPublic: true, deletedAt: true,
  originalKey: true, thumbKey: true, mediumKey: true, largeKey: true,
} as const

export type StorageSync = 'unchanged' | 'made-private' | 'made-public'

/**
 * Brings one photo's files in line with its visibility, a trashed photo
 * counting as private.
 *
 * Going private, the order is: the row is already hidden (the caller changed
 * `visibility` first), then the display versions are copied to new private
 * keys, then the row is pointed at them, then the old files are deleted. A
 * failure anywhere leaves the photo hidden in every listing with its old
 * files still public, which the hourly sweep finishes; it never leaves a
 * listed photo pointing at nothing.
 *
 * Going public, the existing private keys are made readable first and the row
 * second, so a public page never names a file it cannot load. Those keys were
 * never public, so nothing outside the owner's own views knows them.
 *
 * The row update is conditioned on the keys it read, so two of these racing
 * on one photo cannot both win; the loser deletes its own copies.
 */
export async function syncPhotoStorage(photoId: string): Promise<StorageSync> {
  const photo = await prisma.photo.findUnique({ where: { id: photoId }, select: STORAGE_SELECT })
  if (!photo || photo.kind !== 'COMMUNITY') return 'unchanged'
  // A photo in the Trash is treated as private: a deleted photo's files stop
  // loading from the addresses pages and caches knew.
  const wantPublic = photo.visibility === 'PUBLIC' && photo.deletedAt === null
  if (wantPublic === photo.imagesPublic) return 'unchanged'

  const current = { thumbKey: photo.thumbKey, mediumKey: photo.mediumKey, largeKey: photo.largeKey }

  if (wantPublic) {
    for (const key of [photo.thumbKey, photo.mediumKey, photo.largeKey]) {
      if (key) await setObjectAccess(key, 'public')
    }
    await prisma.photo.updateMany({
      where: { id: photo.id, ...current, imagesPublic: false, visibility: 'PUBLIC', deletedAt: null },
      data: { imagesPublic: true, ...storedPaths(photo, true) },
    })
    return 'made-public'
  }

  const moved = {
    thumbKey: newPhotoKey('thumb', extensionOf(photo.thumbKey)),
    mediumKey: newPhotoKey('medium', extensionOf(photo.mediumKey)),
    largeKey: photo.largeKey ? newPhotoKey('large', extensionOf(photo.largeKey)) : null,
  }
  const copied: string[] = []
  try {
    for (const variant of ['thumbKey', 'mediumKey', 'largeKey'] as const) {
      const from = current[variant]
      const to = moved[variant]
      if (!from || !to) continue
      await copyInOSS(from, to, 'private')
      copied.push(to)
    }
    const { count } = await prisma.photo.updateMany({
      where: { id: photo.id, ...current, imagesPublic: true, OR: [{ visibility: 'PRIVATE' }, { deletedAt: { not: null } }] },
      data: { ...moved, imagesPublic: false, ...storedPaths({ ...photo, ...moved }, false) },
    })
    if (count === 0) throw new LostRace()
  } catch (error) {
    await Promise.all(copied.map(key => deleteFromOSS(key).catch(() => {})))
    if (error instanceof LostRace) return 'unchanged'
    throw error
  }
  await Promise.all(
    [current.thumbKey, current.mediumKey, current.largeKey]
      .filter((k): k is string => !!k)
      .map(key => deleteFromOSS(key).catch(error => console.error('[storage] could not delete', key, error)))
  )
  return 'made-private'
}

/** Another request changed the row between reading and writing it. */
class LostRace extends Error {}

/**
 * Finishes moves that did not complete, a few at a time. Run by the hourly
 * cleanup, and safe to run as often as anyone likes.
 */
export async function syncPendingStorage(limit = 50): Promise<{ synced: number; failed: number }> {
  const pending = await prisma.photo.findMany({
    where: {
      kind: 'COMMUNITY',
      OR: [
        { visibility: 'PRIVATE', imagesPublic: true },
        { deletedAt: { not: null }, imagesPublic: true },
        { visibility: 'PUBLIC', deletedAt: null, imagesPublic: false },
      ],
    },
    select: { id: true },
    take: limit,
  })
  let synced = 0
  let failed = 0
  for (const { id } of pending) {
    try {
      if ((await syncPhotoStorage(id)) !== 'unchanged') synced++
    } catch (error) {
      failed++
      console.error('[storage] could not sync', id, error)
    }
  }
  return { synced, failed }
}

/**
 * Syncs storage for photos whose visibility a request just changed. Never
 * throws: the change itself is already saved, and whatever did not finish here
 * is finished by the sweep.
 */
export async function syncStorageAfterVisibilityChange(photoIds: Iterable<string>): Promise<void> {
  for (const id of new Set(photoIds)) {
    try {
      await syncPhotoStorage(id)
    } catch (error) {
      console.error('[storage] could not sync after a visibility change', id, error)
    }
  }
}
