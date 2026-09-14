import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { myPhotosOrder, myPhotosWhere, parseMyPhotosQuery } from '@/lib/myPhotos'
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

/**
 * How many ids one request will hand back for a select-all.
 *
 * Bounded because this is the one mode that is not paged. Well clear of the
 * largest library here, so in practice it is a guard rather than a limit, and
 * the response says when it has bitten rather than silently selecting a
 * prefix of what the viewer asked for.
 */
const MAX_IDS = 5000

/** Counts joined to the names they belong to, most-used first. */
function named(
  counts: { id: string; count: number }[],
  rows: { id: string; name: string; brand: string | null }[],
) {
  return counts
    .flatMap(c => {
      const found = rows.find(r => r.id === c.id)
      return found ? [{ id: found.id, name: [found.brand, found.name].filter(Boolean).join(' '), count: c.count }] : []
    })
    .sort((a, b) => b.count - a.count)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const { searchParams } = new URL(req.url)

  const page = parseIntParam(searchParams.get('page'), { fallback: 1, min: 1, max: 100_000 })
  const pageSize = parseIntParam(searchParams.get('pageSize'), { fallback: 60, min: 1, max: 200 })
  const query = parseMyPhotosQuery(searchParams)
  const where = myPhotosWhere(userId, query)
  const orderBy = myPhotosOrder(query.sort)

  /**
   * Every id this view matches, for selecting the whole of it at once.
   *
   * Without this, "select all" can only ever mean the page in front of you, so
   * a bulk editor asked to fix a hundred and forty frames made you do it sixty
   * at a time — and the selection was cleared on every page turn, so the third
   * pass undid nothing and started again.
   */
  if (searchParams.get('idsOnly') === '1') {
    const rows = await prisma.photo.findMany({
      where,
      orderBy,
      take: MAX_IDS + 1,
      select: { id: true },
    })
    return NextResponse.json({
      ids: rows.slice(0, MAX_IDS).map(r => r.id),
      truncated: rows.length > MAX_IDS,
    })
  }

  const [photos, total] = await Promise.all([
    prisma.photo.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, thumbnailPath: true, caption: true,
        published: true, visibility: true, takenDate: true, createdAt: true,
        width: true, height: true,
        cameraId: true, filmStockId: true,
        camera: { select: { name: true, brand: true } },
        filmStock: { select: { name: true, brand: true } },
      },
    }),
    prisma.photo.count({ where }),
  ])

  /**
   * The cameras, films and years this person actually has.
   *
   * Offered rather than the whole catalog, because a filter naming equipment
   * you have never shot is a filter that can only ever return nothing. Counted
   * against the library rather than the current view, so the list does not
   * rearrange itself underneath the hand that is using it.
   */
  let facets: unknown = undefined
  if (searchParams.get('facets') === '1') {
    const [byCamera, byFilm, rows] = await Promise.all([
      prisma.photo.groupBy({
        by: ['cameraId'],
        where: { userId, cameraId: { not: null } },
        _count: { _all: true },
      }),
      prisma.photo.groupBy({
        by: ['filmStockId'],
        where: { userId, filmStockId: { not: null } },
        _count: { _all: true },
      }),
      prisma.photo.findMany({
        where: { userId, takenDate: { not: null } },
        select: { takenDate: true },
      }),
    ])

    const [cameras, films] = await Promise.all([
      prisma.camera.findMany({
        where: { id: { in: byCamera.map(c => c.cameraId as string) } },
        select: { id: true, name: true, brand: true },
      }),
      prisma.filmStock.findMany({
        where: { id: { in: byFilm.map(f => f.filmStockId as string) } },
        select: { id: true, name: true, brand: true },
      }),
    ])

    const years = new Map<number, number>()
    for (const row of rows) {
      if (!row.takenDate) continue
      const y = row.takenDate.getUTCFullYear()
      years.set(y, (years.get(y) ?? 0) + 1)
    }

    facets = {
      cameras: named(byCamera.map(c => ({ id: c.cameraId as string, count: c._count._all })), cameras),
      films: named(byFilm.map(f => ({ id: f.filmStockId as string, count: f._count._all })), films),
      years: [...years.entries()]
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => b.year - a.year),
    }
  }

  return NextResponse.json({ photos, total, ...(facets ? { facets } : {}) })
}
