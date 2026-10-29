import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { newPhotoKey } from '@/lib/photoStorage'
import type { LibraryUser } from './access'
import { listParts, PART_SIZE, partCount, startUpload } from './multipart'
import { storageUsage } from './storage'
import { importExtensionOf, MAX_IMPORT_FILE_BYTES, NOT_AN_IMPORT_TYPE } from './importTypes'

/** Files registered per call. */
export const MAX_FILES_PER_REGISTER = 25

export interface FileToRegister {
  /** The page's own id for the file, echoed back. */
  clientId: string
  filename: string
  folder: string | null
  bytes: number
  sha256: string
  imageSha256: string | null
  rollId: string | null
  rollPosition: number | null
}

/** What became of one registered file. */
export type Registration =
  | { clientId: string; outcome: 'upload'; itemId: string; partSize: number; partCount: number; uploadedParts: number[] }
  | { clientId: string; outcome: 'processing'; itemId: string }
  | { clientId: string; outcome: 'duplicate'; photoId: string; rollId: string | null; reason: string }
  | { clientId: string; outcome: 'refused'; reason: string }

const HEX64 = /^[0-9a-f]{64}$/

/**
 * Registers files for upload in an import, in the order given.
 *
 * A file already in the library, by its bytes or its image data, is not
 * uploaded again: the answer names the photo it matches. A file still on its
 * way from an earlier visit is resumed: the answer lists the parts the bucket
 * already holds. A file that would take the account over its storage limit is
 * refused, and so is every one after it.
 */
export async function registerFiles(
  user: LibraryUser,
  importId: string,
  files: FileToRegister[],
): Promise<Registration[]> {
  const usage = await storageUsage(user)
  let used = usage.usedBytes
  const results: Registration[] = []

  const rollIds = [...new Set(files.flatMap(f => (f.rollId ? [f.rollId] : [])))]
  const ownRolls = new Set((await prisma.roll.findMany({
    where: { id: { in: rollIds }, ownerId: user.id },
    select: { id: true },
  })).map(r => r.id))

  for (const file of files) {
    const refused = (reason: string) => results.push({ clientId: file.clientId, outcome: 'refused', reason })
    const ext = importExtensionOf(file.filename)
    if (!ext) { refused(NOT_AN_IMPORT_TYPE); continue }
    if (!Number.isInteger(file.bytes) || file.bytes <= 0) { refused('The file is empty'); continue }
    if (file.bytes > MAX_IMPORT_FILE_BYTES) { refused('Larger than 1 GB'); continue }
    if (!HEX64.test(file.sha256) || (file.imageSha256 !== null && !HEX64.test(file.imageSha256))) {
      refused('The file could not be read'); continue
    }
    if (file.rollId && !ownRolls.has(file.rollId)) { refused('That roll is not in your library'); continue }

    const duplicate = await findInLibrary(user.id, file)
    if (duplicate) {
      results.push({ clientId: file.clientId, outcome: 'duplicate', photoId: duplicate.photoId, rollId: duplicate.rollId, reason: duplicate.reason })
      continue
    }

    const active = await activeItem(user.id, file.sha256)
    if (active) {
      // Dropped again: it belongs to this import and where it was just
      // dropped. A photo being made right now is moved by the worker once it
      // exists (processImportItem).
      await prisma.importItem.update({
        where: { id: active.id },
        data: { importId, rollId: file.rollId, rollPosition: file.rollId ? file.rollPosition : null },
      })
      if (active.rollId && active.rollId !== file.rollId) await deleteIfEmpty(user.id, active.rollId)
      results.push(await resumeOf(file.clientId, active))
      continue
    }

    if (usage.limitBytes !== null && used + file.bytes > usage.limitBytes) {
      refused('This would go over your storage limit')
      continue
    }

    const originalKey = newPhotoKey('original', ext)
    const uploadId = await startUpload(originalKey)
    try {
      const item = await prisma.importItem.create({
        data: {
          importId,
          userId: user.id,
          rollId: file.rollId,
          rollPosition: file.rollId ? file.rollPosition : null,
          filename: file.filename.slice(0, 255),
          folder: file.folder?.slice(0, 500) ?? null,
          bytes: file.bytes,
          sha256: file.sha256,
          imageSha256: file.imageSha256,
          originalKey,
          multipartUploadId: uploadId,
          partSize: PART_SIZE,
        },
      })
      used += file.bytes
      results.push({
        clientId: file.clientId, outcome: 'upload', itemId: item.id,
        partSize: PART_SIZE, partCount: partCount(file.bytes), uploadedParts: [],
      })
    } catch (error) {
      // The same file registered by another tab a moment ago: resume that one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await activeItem(user.id, file.sha256)
        if (raced) { results.push(await resumeOf(file.clientId, raced)); continue }
      }
      throw error
    }
  }
  return results
}

/** A photo in the owner's library with the same bytes or the same image data. */
async function findInLibrary(userId: string, file: FileToRegister): Promise<{ photoId: string; rollId: string | null; reason: string } | null> {
  const match = await prisma.photo.findFirst({
    where: {
      userId,
      kind: 'COMMUNITY',
      OR: [
        { originalSha256: file.sha256 },
        ...(file.imageSha256 ? [{ imageSha256: file.imageSha256 }] : []),
      ],
    },
    select: { id: true, rollId: true, originalSha256: true, deletedAt: true },
  })
  if (!match) return null
  const where = match.deletedAt ? ' (in your Trash)' : ''
  return {
    photoId: match.id,
    rollId: match.rollId,
    reason: match.originalSha256 === file.sha256
      ? `Already in your library${where}`
      : `Already in your library with different metadata${where}`,
  }
}

const ACTIVE = ['UPLOADING', 'UPLOADED', 'PROCESSING'] as const

function activeItem(userId: string, sha256: string) {
  return prisma.importItem.findFirst({
    where: { userId, sha256, state: { in: [...ACTIVE] } },
    select: { id: true, state: true, rollId: true, originalKey: true, multipartUploadId: true, bytes: true, partSize: true },
  })
}

/**
 * Deletes a roll left with nothing in it: the roll a closed tab made, once
 * its files have been dropped again into a roll of their own.
 */
async function deleteIfEmpty(userId: string, rollId: string) {
  await prisma.roll.deleteMany({
    where: { id: rollId, ownerId: userId, photos: { none: {} }, importItems: { none: {} } },
  })
}

async function resumeOf(
  clientId: string,
  item: NonNullable<Awaited<ReturnType<typeof activeItem>>>,
): Promise<Registration> {
  if (item.state !== 'UPLOADING' || !item.multipartUploadId) {
    return { clientId, outcome: 'processing', itemId: item.id }
  }
  const parts = await listParts(item.originalKey, item.multipartUploadId)
  return {
    clientId, outcome: 'upload', itemId: item.id,
    partSize: item.partSize, partCount: partCount(item.bytes, item.partSize),
    uploadedParts: parts.map(p => p.partNumber),
  }
}

/** One of the account's items that is still uploading, or null. */
export function uploadingItem(userId: string, itemId: string) {
  return prisma.importItem.findFirst({
    where: { id: itemId, userId, state: 'UPLOADING', multipartUploadId: { not: null } },
    select: { id: true, originalKey: true, multipartUploadId: true, bytes: true, partSize: true },
  })
}
