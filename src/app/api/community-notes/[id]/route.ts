import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

const MIN_LEN = 3
const MAX_LEN = 2000

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id: string }).id
  const { id } = await params

  // Shares the bucket with posting: an edit rewrites the same public text, so
  // it should not be a way around the limit on writing it.
  const limited = enforceLimit(
    'note-write', userId, LIMITS.contentWrite.perUser,
    'You are editing very quickly. Please wait a moment.'
  )
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const content = (body?.content ?? '').trim()
  if (content.length < MIN_LEN || content.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Content must be ${MIN_LEN}-${MAX_LEN} chars` },
      { status: 400 }
    )
  }

  const note = await prisma.communityNote.findUnique({ where: { id } })
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await prisma.communityNote.update({
    where: { id },
    data: { content },
    include: {
      user: { select: { username: true, name: true, avatar: true } },
      _count: { select: { votes: true } },
    },
  })
  const myVote = await prisma.noteVote.findUnique({
    where: { userId_noteId: { userId, noteId: id } },
  }).catch(() => null)

  return NextResponse.json({
    id: updated.id,
    content: updated.content,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    edited: true,
    user: updated.user,
    isAuthor: updated.userId === userId,
    helpfulCount: updated._count.votes,
    votedHelpful: !!myVote,
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id: string }).id
  const { id } = await params

  const note = await prisma.communityNote.findUnique({ where: { id } })
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.communityNote.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
