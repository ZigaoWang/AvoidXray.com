import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { uploadingItem } from '@/lib/library/importItems'
import { completeUpload } from '@/lib/library/multipart'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

/**
 * Finishes a file's upload once every part is stored, and queues it for the
 * import worker. When parts are missing the answer lists them and nothing
 * changes, so the page can send them and ask again.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const { id } = await params
  const item = await uploadingItem(user.id, id)
  if (!item) {
    // Completed already, by a retry whose answer was lost: say where it is.
    const known = await prisma.importItem.findFirst({ where: { id, userId: user.id }, select: { state: true } })
    return known
      ? NextResponse.json({ state: known.state })
      : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const result = await completeUpload(item.originalKey, item.multipartUploadId!, { bytes: item.bytes, partSize: item.partSize })
  if (!result.ok) return NextResponse.json({ error: result.reason, missingParts: result.missing }, { status: 409 })

  await prisma.importItem.update({
    where: { id: item.id },
    data: { state: 'UPLOADED', multipartUploadId: null, error: null },
  })
  return NextResponse.json({ state: 'UPLOADED' })
}
