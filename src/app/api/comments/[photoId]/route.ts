import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canViewPhoto } from '@/lib/photoVisibility'
import { bylineUserSelect } from '@/lib/publicUser'
import { hiddenUserIds } from '@/lib/blocks'

/**
 * How many comments one request answers with.
 *
 * There was no `take` at all, so a photo that had collected a thousand
 * comments sent all thousand — each with a byline joined onto it — to every
 * reader who opened the page, and the response grew for as long as the
 * conversation did. Fifty is several screens' worth and a bounded index read.
 */
const PAGE_SIZE = 50

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

  // Paged from a timestamp rather than an offset. A conversation is written
  // into from the top while it is being read, and every comment posted during
  // a read would shift an offset by one — sending the row at the boundary
  // twice, or never.
  const rawBefore = new URL(req.url).searchParams.get('before')
  const before = rawBefore ? new Date(rawBefore) : null
  if (before && Number.isNaN(before.getTime())) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  }

  const where = { photoId, ...(hidden.length > 0 ? { userId: { notIn: hidden } } : {}) }

  const comments = await prisma.comment.findMany({
    where: { ...where, ...(before ? { createdAt: { lt: before } } : {}) },
    include: { user: { select: bylineUserSelect } },
    orderBy: { createdAt: 'desc' },
    // One over the page, so whether there is another one is answered by the
    // same read instead of a second query. The photo feed probes the same way.
    take: PAGE_SIZE + 1
  })

  const hasMore = comments.length > PAGE_SIZE
  const page = hasMore ? comments.slice(0, PAGE_SIZE) : comments

  // Counted for the first page only: the heading names how many comments the
  // photo has, which is a fact about the photo and not about how far down the
  // reader has paged, and repeating the count for every page would be work
  // nothing reads.
  const total = before ? undefined : await prisma.comment.count({ where })

  return NextResponse.json({
    comments: page,
    // Where the next request resumes — the oldest row handed over here.
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    total
  })
}
