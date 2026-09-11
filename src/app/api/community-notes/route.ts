import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hiddenUserIds } from '@/lib/blocks'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'

const MIN_LEN = 3
const MAX_LEN = 2000
const VALID_TARGETS = new Set(['camera', 'filmstock'])

async function userHasShotWith(userId: string, targetType: string, targetId: string): Promise<boolean> {
  if (targetType === 'camera') {
    // Matched by name and brand rather than by id alone.
    //
    // The reason has changed since this was written. Cameras used to be one row
    // per user, and the comment here still described that model long after it
    // was replaced by shared catalog rows. What keeps the lookup is that
    // Camera.name carries no unique constraint, so two rows for one body can
    // exist until somebody merges them, and a note is about the camera rather
    // than about whichever of those rows a photo happens to point at.
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

  // The same rule the comments under a photo already apply. A note is a
  // person's writing shown with their name, avatar and a link to their
  // profile, and a blocked account's notes stayed on the camera and film pages
  // for the person who blocked them, which is exactly what the block removes
  // everywhere else. This list is fetched by the client, so the block list the
  // page computed does not reach it and has to be read again here.
  const hidden = await hiddenUserIds(userId)

  const notes = await prisma.communityNote.findMany({
    where: {
      targetType,
      targetId,
      ...(hidden.length > 0 ? { userId: { notIn: hidden } } : {}),
    },
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

  const limited = enforceLimit(
    'note-write', userId, LIMITS.contentWrite.perUser,
    'You are posting notes very quickly. Please wait a moment.'
  )
  if (limited) return limited

  const body = await readJsonObject(req)
  if (!body) return invalidBody()

  // Read through asString rather than asserting the shape: a numeric content
  // satisfied the `?: string` cast and then threw out of `.trim()` as a 500,
  // when it should land in the length check below as a 400.
  const targetType = asString(body.targetType)
  const targetId = asString(body.targetId)
  const content = asString(body.content)

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
