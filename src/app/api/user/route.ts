import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { ownedOssKey } from '@/lib/ossUtils'
import { safeHttpUrl, sanitizeHandle, VALIDATION_LIMITS } from '@/lib/validation'
import { readJsonObject, invalidBody, asNullableString } from '@/lib/requestBody'

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
  const { name, bio, website, instagram, twitter } = body
  // Absent and null mean different things here. Every save from the settings
  // form sends the avatar it knows about, and that value comes from the
  // per-device session token — so a device signed in before the avatar was set
  // sends nothing, and `avatar || null` turned an unrelated bio edit into a
  // deletion of the picture and of the object behind it.
  const avatar = asNullableString(body.avatar)
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

  // Only a URL this server minted under avatars/ is accepted. The stored value
  // decides what gets deleted from the bucket below, so an unchecked one is a
  // way to have the server delete an object belonging to someone else.
  if (typeof avatar === 'string' && !ownedOssKey(avatar, 'avatars/')) {
    return NextResponse.json({ error: 'That is not an avatar this site issued' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: name || null,
      ...(avatar === undefined ? {} : { avatar }),
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
    const oldKey = ownedOssKey(existing.avatar, 'avatars/')
    if (oldKey) await deleteFromOSS(oldKey).catch(() => {})
  }

  return NextResponse.json({ user })
}
