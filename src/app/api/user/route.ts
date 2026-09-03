import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { safeHttpUrl, sanitizeHandle, VALIDATION_LIMITS } from '@/lib/validation'
import { readJsonObject, invalidBody } from '@/lib/requestBody'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentUserId = (session.user as { id: string }).id

  // Check if requesting a specific user by ID (admin only)
  const searchParams = req.nextUrl.searchParams
  const requestedUserId = searchParams.get('id')

  if (requestedUserId) {
    // Verify current user is admin
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { isAdmin: true },
    })
    if (!currentUser?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Fetch requested user
    const user = await prisma.user.findUnique({
      where: { id: requestedUserId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        avatar: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
  }

  // Default: return current user's info
  const user = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      avatar: true,
      bio: true,
      website: true,
      instagram: true,
      twitter: true
    }
  })

  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const { name, avatar, bio, website, instagram, twitter } = body
  const tooLong = (value: unknown, max: number) => typeof value === 'string' && value.length > max
  if (tooLong(bio, VALIDATION_LIMITS.MAX_BIO_LENGTH)) {
    return NextResponse.json(
      { error: `Bio must be ${VALIDATION_LIMITS.MAX_BIO_LENGTH} characters or fewer` }, { status: 400 }
    )
  }
  if (tooLong(name, VALIDATION_LIMITS.MAX_NAME_LENGTH)) {
    return NextResponse.json(
      { error: `Name must be ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters or fewer` }, { status: 400 }
    )
  }

  // Read before the write so the replaced avatar is known. POST /api/avatar
  // used to delete it at upload time, which orphaned the account's avatar if
  // this save never followed.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true }
  })

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: name || null,
      avatar: avatar || null,
      bio: bio || null,
      // Normalized here rather than trusted from the form: these three are
      // rendered as links on a public profile.
      website: safeHttpUrl(website),
      instagram: sanitizeHandle(instagram),
      twitter: sanitizeHandle(twitter)
    }
  })

  // Only once the new value is committed, and only if it really changed.
  // Failure here costs an unreferenced object, which the OSS sweep collects.
  if (existing?.avatar && existing.avatar !== user.avatar) {
    const oldKey = extractKeyFromUrl(existing.avatar)
    if (oldKey) await deleteFromOSS(oldKey).catch(() => {})
  }

  return NextResponse.json({ user })
}
