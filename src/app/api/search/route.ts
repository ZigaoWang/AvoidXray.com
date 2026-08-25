import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchFilmStockIds } from '@/lib/filmSearch'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() || ''
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10')

  if (!q) {
    return NextResponse.json({ photos: [], users: [], cameras: [], films: [] })
  }

  const [photos, users, cameras, filmMatches] = await Promise.all([
    prisma.photo.findMany({
      where: { ...PUBLIC_PHOTO, caption: { contains: q, mode: 'insensitive' } },
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
    searchFilmStockIds(q, limit),
  ])

  // Film stocks are matched by id first so alternate names can take part, then
  // hydrated here. matchedAlias travels with the result so the UI can show why
  // a stock came back for a query that does not appear in its name.
  const filmRecords = await prisma.filmStock.findMany({
    where: { id: { in: filmMatches.map((m) => m.id) } },
    select: {
      id: true,
      name: true,
      brand: true,
      manufacturer: true,
      aliases: true,
      _count: { select: { photos: true } },
    },
  })
  const order = new Map(filmMatches.map((m, i) => [m.id, i]))
  const films = filmRecords
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((f) => ({ ...f, matchedAlias: filmMatches.find((m) => m.id === f.id)?.matchedAlias ?? null }))

  return NextResponse.json({ photos, users, cameras, films })
}
