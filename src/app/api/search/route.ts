import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Casings to try against the aliases array.
 *
 * Postgres array containment has no case-insensitive form, so rather than
 * scanning every row the handful of realistic spellings are matched directly.
 */
function aliasCandidates(q: string): string[] {
  const trimmed = q.trim()
  const title = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
  return [...new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase(), title])]
}

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
          { manufacturer: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          // Alternate names and product codes. Someone searching "5219" means
          // Kodak Vision3 500T, which shares no words with that query.
          // Array containment is exact, so the common casings are tried.
          { aliases: { hasSome: aliasCandidates(q) } },
        ]
      },
      select: {
        id: true,
        name: true,
        brand: true,
        manufacturer: true,
        aliases: true,
        _count: { select: { photos: true } },
      },
      take: limit
    })
  ])

  return NextResponse.json({ photos, users, cameras, films })
}
