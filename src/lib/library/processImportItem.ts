import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { identifyOriginal, processImage } from '@/lib/image'
import { hammingDistance, sha256Hex } from '@/lib/imageHash'
import { copyInOSS, deleteFromOSS, readFromOSS, setObjectAccess } from '@/lib/oss'
import { newPhotoKey, syncPhotoStorage } from '@/lib/photoStorage'
import { screenImage } from '@/lib/visionScreen'

/**
 * Perceptual hashes this close (of 64 bits) are flagged as a likely duplicate.
 * A rescan of the same frame lands within a few bits; different frames of one
 * roll rarely come within ten.
 */
export const LOOKALIKE_BITS = 6

/** A failure no retry will fix: the item is failed and its upload deleted. */
export class FinalImportError extends Error {}

/**
 * Turns one uploaded import item into a photo.
 *
 * The stored bytes are checked against the hash the browser registered,
 * because that hash is what duplicates are found by. The photo is made by the
 * same pipeline as an upload through the site, from the original where the
 * browser put it, and is created private unless its owner already chose to
 * publish it. A photo that looks like one already in the library is flagged on
 * the item for the owner to decide.
 */
export async function processImportItem(itemId: string): Promise<string> {
  const item = await prisma.importItem.findUniqueOrThrow({ where: { id: itemId } })
  if (item.photoId) return item.photoId

  // Completing the upload made it private; made so again here, since an
  // original anyone can read is the one thing this must never leave behind.
  await setObjectAccess(item.originalKey, 'private')
  const bytes = await readFromOSS(item.originalKey)
  if (bytes.length !== item.bytes || (await sha256Hex(bytes)) !== item.sha256) {
    throw new FinalImportError('The stored file is not the file that was sent')
  }

  let original
  try {
    original = await identifyOriginal(bytes)
  } catch (error) {
    throw new FinalImportError(error instanceof Error ? error.message : String(error))
  }

  // Stored under the extension its name gave; keep it under the one its bytes do.
  let originalKey = item.originalKey
  if (!originalKey.endsWith(`.${original.ext}`)) {
    originalKey = newPhotoKey('original', original.ext)
    await copyInOSS(item.originalKey, originalKey, 'private')
  }

  const id = randomUUID()
  const screen = await screenImage(original.source)
  const processed = await processImage(bytes, original, id, { imagesPublic: false, storedOriginalKey: originalKey })

  try {
    await prisma.$transaction([
      prisma.photo.create({
        data: {
          id,
          userId: item.userId,
          ...processed.data,
          originalFilename: item.filename,
          uploadComplete: true,
          visibility: 'PRIVATE',
          rollId: item.rollId,
          rollPosition: item.rollId ? item.rollPosition : null,
          ...(screen
            ? { screening: screen.hold ? 'HELD' as const : 'CLEAR' as const, nudityScore: screen.score, nudityModel: screen.model }
            : {}),
        },
      }),
      prisma.importItem.update({
        where: { id: item.id },
        data: {
          state: 'DONE', photoId: id, error: null, multipartUploadId: null, originalKey,
          lookalikeOfId: await lookalikeOf(item.userId, id, processed.data.perceptualHash),
        },
      }),
    ])
  } catch (error) {
    await Promise.all(processed.keys.map(key => deleteFromOSS(key).catch(() => {})))
    if (originalKey !== item.originalKey) await deleteFromOSS(originalKey).catch(() => {})
    throw error
  }
  if (originalKey !== item.originalKey) await deleteFromOSS(item.originalKey).catch(() => {})

  // Read now, not when the item was claimed: the owner may have answered the
  // publish question or moved the file while the photo was being made, and
  // the publish and move routes only act on photos that already exist.
  const answer = await prisma.importItem.findUniqueOrThrow({
    where: { id: item.id },
    select: { publish: true, rollId: true, rollPosition: true, import: { select: { publishChoice: true } } },
  })
  // Moved to another roll while it was being made: the photo follows.
  if (answer.rollId !== item.rollId || answer.rollPosition !== item.rollPosition) {
    await prisma.photo.update({ where: { id }, data: { rollId: answer.rollId, rollPosition: answer.rollPosition } })
  }
  if (answer.import.publishChoice === 'ALL' || (answer.import.publishChoice === 'CHOSEN' && answer.publish)) {
    await publishPhotos(item.userId, [id])
  }
  return id
}

/**
 * Publishes photos the importer made: public visibility, then display files
 * made readable. They were made private, so nothing has listed them yet and
 * nothing needs refreshing.
 */
export async function publishPhotos(userId: string, photoIds: string[]): Promise<void> {
  if (!photoIds.length) return
  await prisma.photo.updateMany({ where: { id: { in: photoIds }, userId }, data: { visibility: 'PUBLIC' } })
  for (const id of photoIds) await syncPhotoStorage(id)
}

/** The closest photo in the library within LOOKALIKE_BITS, if any. */
async function lookalikeOf(userId: string, photoId: string, hash: string): Promise<string | null> {
  const others = await prisma.photo.findMany({
    where: { userId, kind: 'COMMUNITY', id: { not: photoId }, perceptualHash: { not: null } },
    select: { id: true, perceptualHash: true },
  })
  let best: { id: string; distance: number } | null = null
  for (const other of others) {
    const distance = hammingDistance(hash, other.perceptualHash!)
    if (distance <= LOOKALIKE_BITS && (!best || distance < best.distance)) best = { id: other.id, distance }
  }
  return best?.id ?? null
}
