import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const MIN_LEN = 3
const MAX_LEN = 2000
const VALID_TARGETS = new Set(['camera', 'filmstock'])

async function userHasShotWith(userId: string, targetType: string, targetId: string): Promise<boolean> {
  if (targetType === 'camera') {
    // Camera has @@unique([name, userId]) — each user has own row for same physical camera.
    // Match by name+brand across all Camera rows so photos linked to any variant count.
    const target = await prisma.camera.findUnique({
      where: { id: targetId },
      select: { name: true, brand: true },
    })
    if (!target) return false
    const siblingIds = await prisma.camera.findMany({
      where: { name: target.name, brand: target.brand },
      select: { id: true },
    })
    const ids = siblingIds.map(c => c.id)
    if (ids.length === 0) return false
    const count = await prisma.photo.count({
      where: { userId, cameraId: { in: ids } },
    })
    return count > 0
  }

  // FilmStock names are globally unique — direct id match is safe.
  const count = await prisma.photo.count({
    where: { userId, filmStockId: targetId },
  })
  return count > 0
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const targetType = searchParams.get('targetType')
  const targetId = searchParams.get('targetId')

  if (!targetType || !targetId || !VALID_TARGETS.has(targetType)) {
    return NextResponse.json({ error: 'Missing or invalid target' }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const notes = await prisma.communityNote.findMany({
    where: { targetType, targetId },
    include: {
      user: { select: { username: true, name: true, avatar: true } },
      _count: { select: { votes: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const myVotes = userId
    ? await prisma.noteVote.findMany({
        where: { userId, noteId: { in: notes.map(n => n.id) } },
        select: { noteId: true },
      })
    : []
  const myVoted = new Set(myVotes.map(v => v.noteId))

  const hasShotWith = userId ? await userHasShotWith(userId, targetType, targetId) : false

  const payload = notes.map(n => ({
    id: n.id,
    content: n.content,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    edited: n.updatedAt.getTime() - n.createdAt.getTime() > 1000,
    user: n.user,
    isAuthor: userId ? n.userId === userId : false,
    helpfulCount: n._count.votes,
    votedHelpful: myVoted.has(n.id),
  }))

  return NextResponse.json({
    notes: payload,
    canPost: !!userId && hasShotWith,
    hasShotWith,
    authenticated: !!userId,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id: string }).id

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { targetType, targetId, content } = body as {
    targetType?: string
    targetId?: string
    content?: string
  }

  if (!targetType || !VALID_TARGETS.has(targetType) || !targetId) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }
  const trimmed = (content ?? '').trim()
  if (trimmed.length < MIN_LEN || trimmed.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Content must be ${MIN_LEN}-${MAX_LEN} chars` },
      { status: 400 }
    )
  }

  // Verify target exists
  if (targetType === 'camera') {
    const exists = await prisma.camera.findUnique({ where: { id: targetId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Target not found' }, { status: 404 })
  } else {
    const exists = await prisma.filmStock.findUnique({ where: { id: targetId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Target not found' }, { status: 404 })
  }

  // Permission: must have shot with it
  const hasShotWith = await userHasShotWith(userId, targetType, targetId)
  if (!hasShotWith) {
    return NextResponse.json(
      { error: `Upload a photo shot with this ${targetType === 'camera' ? 'camera' : 'film stock'} first` },
      { status: 403 }
    )
  }

  const note = await prisma.communityNote.create({
    data: { targetType, targetId, userId, content: trimmed },
    include: {
      user: { select: { username: true, name: true, avatar: true } },
      _count: { select: { votes: true } },
    },
  })

  return NextResponse.json({
    id: note.id,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    edited: false,
    user: note.user,
    isAuthor: true,
    helpfulCount: 0,
    votedHelpful: false,
  })
}
