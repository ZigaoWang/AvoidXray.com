import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase() || ''
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10')

  if (!q) {
    return NextResponse.json({ photos: [], users: [], cameras: [], films: [] })
  }

  const [photos, users, cameras, films] = await Promise.all([
    prisma.photo.findMany({
      where: { caption: { contains: q } },
      select: { id: true, thumbnailPath: true, caption: true },
      take: limit
    }),
    prisma.user.findMany({
      where: { OR: [{ username: { contains: q } }, { name: { contains: q } }] },
      select: { username: true, name: true, avatar: true },
      take: limit
    }),
    prisma.camera.findMany({
      where: { OR: [{ name: { contains: q } }, { brand: { contains: q } }] },
      select: { id: true, name: true, _count: { select: { photos: true } } },
      take: limit
    }),
    prisma.filmStock.findMany({
      where: { OR: [{ name: { contains: q } }, { brand: { contains: q } }] },
      select: { id: true, name: true, _count: { select: { photos: true } } },
      take: limit
    })
  ])

  return NextResponse.json({ photos, users, cameras, films })
}
