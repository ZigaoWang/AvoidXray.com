import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseIntParam } from '@/lib/validation'

/**
 * The signed-in person's own photos.
 *
 * Returns `{ photos, total }` and pages. It previously returned a bare array of
 * every published photo they owned — fine at a few dozen, not at a thousand,
 * and the album pickers built on it were already loading the lot.
 *
 * `published` is included rather than filtered out: the photo manager is the
 * one place someone can see a draft that failed to publish.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const { searchParams } = new URL(req.url)

  const page = parseIntParam(searchParams.get('page'), { fallback: 1, min: 1, max: 100_000 })
  const pageSize = parseIntParam(searchParams.get('pageSize'), { fallback: 60, min: 1, max: 200 })
  const search = (searchParams.get('search') ?? '').trim()
  const filter = searchParams.get('filter') ?? ''

  const where = {
    userId,
    ...(search ? { caption: { contains: search, mode: 'insensitive' as const } } : {}),
    ...(filter === 'published' ? { published: true } : {}),
    ...(filter === 'drafts' ? { published: false } : {}),
    ...(filter === 'private' ? { visibility: 'PRIVATE' as const } : {}),
    ...(filter === 'untagged' ? { OR: [{ cameraId: null }, { filmStockId: null }] } : {}),
  }

  const [photos, total] = await Promise.all([
    prisma.photo.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, thumbnailPath: true, caption: true,
        published: true, visibility: true, takenDate: true, createdAt: true,
        cameraId: true, filmStockId: true,
        camera: { select: { name: true } },
        filmStock: { select: { name: true } },
      },
    }),
    prisma.photo.count({ where }),
  ])

  return NextResponse.json({ photos, total })
}
