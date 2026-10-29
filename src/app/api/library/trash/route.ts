import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { parseIds } from '@/lib/library/requests'
import { purgeTrashed, TRASH_DAYS } from '@/lib/library/trash'
import { signedObjectUrl } from '@/lib/oss'
import { readJsonObject } from '@/lib/requestBody'

const PER_PAGE = 120

/** The owner's Trash, most recently deleted first, with when each goes for good. */
export async function GET(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const page = Math.max(0, Number(req.nextUrl.searchParams.get('page')) || 0)
  const photos = await prisma.photo.findMany({
    where: { userId: user.id, kind: 'COMMUNITY', deletedAt: { not: null } },
    select: { id: true, thumbKey: true, deletedAt: true, width: true, height: true, caption: true },
    orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
    skip: page * PER_PAGE,
    take: PER_PAGE + 1,
  })
  const day = 24 * 60 * 60 * 1000
  return NextResponse.json({
    more: photos.length > PER_PAGE,
    photos: await Promise.all(photos.slice(0, PER_PAGE).map(async p => ({
      id: p.id,
      // Trashed files are private, so the owner's thumbnail is signed.
      src: await signedObjectUrl(p.thumbKey),
      width: p.width,
      height: p.height,
      caption: p.caption,
      purgeAt: new Date(p.deletedAt!.getTime() + TRASH_DAYS * day).toISOString(),
    }))),
  })
}

/** Deletes photos in the Trash for good: the ones named, or all of them. */
export async function DELETE(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const body = await readJsonObject(req)
  const ids = body?.ids === undefined ? undefined : parseIds(body.ids) ?? []
  let purged = 0
  // In batches: purgeTrashed takes a few hundred at a time.
  for (;;) {
    const n = await purgeTrashed({ ownerId: user.id, ids })
    purged += n
    if (n === 0 || ids) break
  }
  return NextResponse.json({ purged })
}
