import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canViewPhoto } from '@/lib/photoVisibility'
import { commentPage } from '@/lib/comments'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const { photoId } = await params

  // The conversation under a photo is part of the photo. Unguarded, this
  // handed the comments on a private photo — and the identity of everyone who
  // wrote one — to anyone holding the id.
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { userId: true, published: true, visibility: true }
  })
  if (!photo || !canViewPhoto(photo, viewerId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  const rawBefore = new URL(req.url).searchParams.get('before')
  const before = rawBefore ? new Date(rawBefore) : undefined
  if (before && Number.isNaN(before.getTime())) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  }

  return NextResponse.json(await commentPage(photoId, viewerId, before))
}
