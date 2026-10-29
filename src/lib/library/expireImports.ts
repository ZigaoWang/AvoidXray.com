import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { abortUpload } from './multipart'

/**
 * How long an upload may sit unfinished before its parts are thrown away.
 * The same as the bucket's lifecycle rule, which aborts the upload on the
 * bucket's side whatever happens here.
 */
export const UPLOAD_EXPIRES_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Fails import items whose upload was left unfinished, and throws away the
 * parts stored for them. The item stays, failed, so the import page can list
 * the file as not finished for a while after.
 */
export async function expireAbandonedUploads(limit = 200): Promise<number> {
  const stale = await prisma.importItem.findMany({
    where: { state: 'UPLOADING', updatedAt: { lt: new Date(Date.now() - UPLOAD_EXPIRES_MS) } },
    select: { id: true, originalKey: true, multipartUploadId: true },
    take: limit,
  })
  for (const item of stale) {
    const { count } = await prisma.importItem.updateMany({
      where: { id: item.id, state: 'UPLOADING' },
      data: { state: 'FAILED', multipartUploadId: null, error: 'The upload was not finished' },
    })
    if (!count) continue
    if (item.multipartUploadId) await abortUpload(item.originalKey, item.multipartUploadId).catch(() => {})
    await deleteFromOSS(item.originalKey).catch(() => {})
  }
  return stale.length
}
