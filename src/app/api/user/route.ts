import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
    const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } })
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
  const { name, avatar, bio, website, instagram, twitter } = await req.json()

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: name || null,
      avatar: avatar || null,
      bio: bio || null,
      website: website || null,
      instagram: instagram || null,
      twitter: twitter || null
    }
  })

  return NextResponse.json({ user })
}
