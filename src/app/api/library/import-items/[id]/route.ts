import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { abortUpload } from '@/lib/library/multipart'
import { deleteFromOSS } from '@/lib/oss'

/**
 * Takes a file out of an import before it became a photo: its upload is
 * thrown away and the item removed. A file already made into a photo is in
 * the library, and is deleted from there.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id } = await params

  const item = await prisma.importItem.findFirst({
    where: { id, userId: user.id, state: { in: ['UPLOADING', 'UPLOADED', 'FAILED'] } },
    select: { id: true, state: true, originalKey: true, multipartUploadId: true },
  })
  if (!item) return NextResponse.json({ error: 'This file cannot be taken out of the import' }, { status: 409 })

  // Removed first and only in the state read, so the worker cannot claim it
  // while its file is deleted.
  const { count } = await prisma.importItem.deleteMany({ where: { id: item.id, state: item.state } })
  if (!count) return NextResponse.json({ error: 'This file is already being made into a photo' }, { status: 409 })
  if (item.multipartUploadId) await abortUpload(item.originalKey, item.multipartUploadId).catch(() => {})
  await deleteFromOSS(item.originalKey).catch(() => {})
  return NextResponse.json({ ok: true })
}
