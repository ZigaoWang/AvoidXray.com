import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { identifyOriginal, processImage } from '@/lib/image'
import { sha256Hex } from '@/lib/imageHash'
import { lookalikeCandidate } from './lookalike'
import { copyInOSS, deleteFromOSS, readFromOSS, setObjectAccess } from '@/lib/oss'
import { newPhotoKey, syncPhotoStorage } from '@/lib/photoStorage'
import { screenImage } from '@/lib/visionScreen'

/** A failure no retry will fix: the item is failed and its upload deleted. */
export class FinalImportError extends Error {}

/**
 * Turns one uploaded import item into a photo.
 *
 * The stored bytes are checked against the hash the browser registered,
 * because that hash is what duplicates are found by. The photo is made by the
 * same pipeline as an upload through the site, from the original where the
 * browser put it, and is created private unless its owner already chose to
 * publish it. A photo whose hash is near one already in the library is noted
 * as a candidate on the item; lookalike.ts decides whether it is flagged.
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
          lookalikeOfId: await lookalikeCandidate(item.userId, id, processed.data.perceptualHash),
        },
      }),
      auditUpload(item.importId, id, item.rollId),
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
    await auditUpload(item.importId, null, answer.rollId)
  }
  if (answer.import.publishChoice === 'ALL' || (answer.import.publishChoice === 'CHOSEN' && answer.publish)) {
    await publishPhotos(item.userId, [id])
  }
  return id
}

/**
 * Adds the photo, and its roll if new, to the import's audit entry. Only an
 * admin's upload for another account has one; for every other import this
 * matches no row.
 */
function auditUpload(importId: string, photoId: string | null, rollId: string | null) {
  return prisma.$executeRaw`
    UPDATE "AdminUploadAudit"
    SET "photoIds" = CASE WHEN ${photoId}::text IS NULL THEN "photoIds" ELSE array_append("photoIds", ${photoId}::text) END,
        "rollIds" = CASE WHEN ${rollId}::text IS NULL OR ${rollId}::text = ANY("rollIds") THEN "rollIds" ELSE array_append("rollIds", ${rollId}::text) END,
        "updatedAt" = now()
    WHERE "importId" = ${importId}`
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
