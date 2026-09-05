import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { hiddenFilter, hiddenUserIds } from '@/lib/blocks'
import { searchCatalogue } from '@/lib/catalogueSearch'
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

  const [photos, users, cameraMatches, filmMatches] = await Promise.all([
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
    // Matched by id first, like film stocks, so alternate names take part and
    // brand is matched through the relation. The legacy brand text column is
    // populated on almost no rows now that brands are their own table, so the
    // old query could only find a camera whose brand appeared in its name.
    searchCatalogue('camera', q, limit),
    searchCatalogue('film', q, limit),
  ])

  // Hydrated after matching, the same way film stocks are. slug travels with
  // the result so the type-ahead links to the canonical path rather than
  // spending a redirect on every click, and the photo count is scoped like
  // every other count on the site so it excludes private and unpublished frames.
  const cameraRecords = await prisma.camera.findMany({
    where: { id: { in: cameraMatches.map(m => m.id) } },
    select: {
      id: true, slug: true, name: true, aliases: true,
      brandRef: { select: { name: true } },
      _count: { select: { photos: { where: photoScope } } },
    },
  })
  const cameraOrder = new Map(cameraMatches.map((m, i) => [m.id, i]))
  const cameras = cameraRecords
    .sort((a, b) => (cameraOrder.get(a.id) ?? 0) - (cameraOrder.get(b.id) ?? 0))
    .map(c => ({
      id: c.id, slug: c.slug, name: c.name, aliases: c.aliases,
      brand: c.brandRef?.name ?? null,
      _count: c._count,
      matchedAlias: cameraMatches.find(m => m.id === c.id)?.matchedAlias ?? null,
    }))

  // Film stocks are matched by id first so alternate names can take part, then
  // hydrated here. matchedAlias travels with the result so the UI can show why
  // a stock came back for a query that does not appear in its name.
  const filmRecords = await prisma.filmStock.findMany({
    where: { id: { in: filmMatches.map((m) => m.id) } },
    select: {
      id: true,
      slug: true,
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
