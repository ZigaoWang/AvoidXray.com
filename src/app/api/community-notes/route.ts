import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { noteList, userHasShotWith } from '@/lib/communityNotes'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { hasBlockedWords, blockedWordsMessage } from '@/lib/wordFilter'

const MIN_LEN = 3
const MAX_LEN = 2000
const VALID_TARGETS = new Set(['camera', 'filmstock'])

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const targetType = searchParams.get('targetType')
  const targetId = searchParams.get('targetId')

  if (!targetType || !targetId || !VALID_TARGETS.has(targetType)) {
    return NextResponse.json({ error: 'Missing or invalid target' }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  return NextResponse.json(await noteList(targetType, targetId, userId))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
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
  if (hasBlockedWords(trimmed, 'text')) {
    return NextResponse.json({ error: blockedWordsMessage('Your note') }, { status: 400 })
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
