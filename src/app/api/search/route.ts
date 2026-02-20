import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() || ''
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10')

  if (!q) {
    return NextResponse.json({ photos: [], users: [], cameras: [], films: [] })
  }

  const [photos, users, cameras, films] = await Promise.all([
    prisma.photo.findMany({
      where: { published: true, caption: { contains: q, mode: 'insensitive' } },
      select: { id: true, thumbnailPath: true, caption: true },
      take: limit
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: { username: true, name: true, avatar: true },
      take: limit
    }),
    prisma.camera.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: { id: true, name: true, brand: true, _count: { select: { photos: true } } },
      take: limit
    }),
    prisma.filmStock.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: { id: true, name: true, brand: true, _count: { select: { photos: true } } },
      take: limit
    })
  ])

  return NextResponse.json({ photos, users, cameras, films })
}
