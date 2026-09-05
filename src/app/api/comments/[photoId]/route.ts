import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canViewPhoto } from '@/lib/photoVisibility'
import { bylineUserSelect } from '@/lib/publicUser'
import { hiddenUserIds } from '@/lib/blocks'

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

  // Blocking is applied both ways everywhere photos are listed, but the
  // conversation under them was exempt: a blocked account's comments stayed
  // under the photo for the person who blocked them, and vice versa. This list
  // is fetched by the client, so the block list the page already computed does
  // not reach it and has to be read again here.
  const hidden = await hiddenUserIds(viewerId)

  const comments = await prisma.comment.findMany({
    where: { photoId, ...(hidden.length > 0 ? { userId: { notIn: hidden } } : {}) },
    include: { user: { select: bylineUserSelect } },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(comments)
}
