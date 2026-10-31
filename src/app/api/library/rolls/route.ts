import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { formatRollDate, ROLL_SELECT, rollDetailsData, rollView, type RollDetailsInput } from '@/lib/library/rollFields'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject } from '@/lib/requestBody'

/**
 * The owner's rolls with photos outside the Trash, newest first, labelled for
 * pickers: the title and the header line.
 */
export async function GET() {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const rolls = await prisma.$queryRaw<{
    id: string; title: string | null; shotFrom: Date | null; shotFromPrecision: string | null
    shotTo: Date | null; shotToPrecision: string | null; filmStock: string | null; camera: string | null; lab: string | null; photos: bigint
  }[]>`
    SELECT r.id, r.title, r."shotFrom", r."shotFromPrecision", r."shotTo", r."shotToPrecision",
      f.name AS "filmStock", c.name AS camera, l.name AS lab, COUNT(p.id) AS photos
    FROM "Roll" r
    JOIN "Photo" p ON p."rollId" = r.id AND p."deletedAt" IS NULL
    LEFT JOIN "FilmStock" f ON f.id = r."filmStockId"
    LEFT JOIN "Camera" c ON c.id = r."cameraId"
    LEFT JOIN "Lab" l ON l.id = r."labId"
    WHERE r."ownerId" = ${user.id}
    GROUP BY r.id, f.name, c.name, l.name
    ORDER BY COALESCE(r."shotFrom"::timestamp, MIN(p."createdAt")) DESC, r.id DESC`
  return NextResponse.json({
    rolls: rolls.map(r => ({
      id: r.id,
      title: r.title,
      // Raw SQL returns the stored spelling of the enum ("month"), not Prisma's.
      shotFrom: formatRollDate(r.shotFrom, r.shotFromPrecision?.toUpperCase() as 'MONTH' | 'DAY' | null),
      shotTo: formatRollDate(r.shotTo, r.shotToPrecision?.toUpperCase() as 'MONTH' | 'DAY' | null),
      filmStock: r.filmStock, camera: r.camera, lab: r.lab,
      photoCount: Number(r.photos),
    })),
  })
}

/** Creates a roll, with whatever details are known yet. */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const body = (await readJsonObject(req)) ?? {}
  const checked = await rollDetailsData(body as RollDetailsInput)
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 })

  try {
    const roll = await prisma.roll.create({
      data: { ...(checked.data as object), ownerId: user.id },
      select: ROLL_SELECT,
    })
    return NextResponse.json({ roll: rollView(roll) })
  } catch (error) {
    if (String(error).includes('Roll_shot_range_in_order')) {
      return NextResponse.json({ error: 'The last shot date is before the first' }, { status: 400 })
    }
    throw error
  }
}
