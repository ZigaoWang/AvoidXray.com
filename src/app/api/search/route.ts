import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { hiddenFilter, hiddenUserIds } from '@/lib/blocks'
import { searchFilmStockIds } from '@/lib/filmSearch'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { parseIntParam } from '@/lib/validation'
import { clientIp, enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() || ''
  // Capped: this fans out into four queries, so an unbounded limit multiplied
  // the cost of a single request by four.
  const limit = parseIntParam(req.nextUrl.searchParams.get('limit'), { fallback: 10, min: 1, max: 50 })

  if (!q) {
    return NextResponse.json({ photos: [], users: [], cameras: [], films: [] })
  }

  // After the empty-query shortcut, so an idle search box costs no allowance.
  const limited = enforceLimit(
    'search', clientIp(req.headers), LIMITS.search.perIp,
    'Too many searches. Please wait a moment and try again.'
  )
  if (limited) return limited

  // Blocked in either direction: neither the accounts themselves nor their
  // photos should surface in the other party's type-ahead.
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const hiddenIds = await hiddenUserIds(viewerId)
  const photoScope: Prisma.PhotoWhereInput = { ...PUBLIC_PHOTO, ...hiddenFilter(hiddenIds) }

  const [photos, users, cameras, filmMatches] = await Promise.all([
    prisma.photo.findMany({
      where: { ...photoScope, caption: { contains: q, mode: 'insensitive' } },
      select: { id: true, thumbnailPath: true, caption: true },
      take: limit
    }),
    prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } }
            ]
          },
          ...(hiddenIds.length > 0 ? [{ id: { notIn: hiddenIds } }] : []),
        ],
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
      // Scoped like every other photo count on the site. Unfiltered, this
      // included private and unpublished frames.
      select: { id: true, name: true, brand: true, _count: { select: { photos: { where: photoScope } } } },
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
      _count: { select: { photos: { where: photoScope } } },
    },
  })
  const order = new Map(filmMatches.map((m, i) => [m.id, i]))
  const films = filmRecords
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((f) => ({ ...f, matchedAlias: filmMatches.find((m) => m.id === f.id)?.matchedAlias ?? null }))

  return NextResponse.json({ photos, users, cameras, films })
}
