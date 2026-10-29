import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { storageUsage } from '@/lib/library/storage'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

/** How far back the import page looks for files that did not finish. */
const UNFINISHED_DAYS = 7

/** Starts an import. */
export async function POST() {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const created = await prisma.import.create({ data: { userId: user.id }, select: { id: true } })
  return NextResponse.json({ id: created.id })
}

/**
 * What the import page needs before anything is dropped: storage used and
 * allowed, and files from recent imports that never finished uploading or
 * could not be made into photos, so they can be dropped again.
 */
export async function GET() {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user

  const [storage, unfinished] = await Promise.all([
    storageUsage(user),
    prisma.importItem.findMany({
      where: {
        userId: user.id,
        state: { in: ['UPLOADING', 'FAILED'] },
        createdAt: { gte: new Date(Date.now() - UNFINISHED_DAYS * 24 * 60 * 60 * 1000) },
      },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, filename: true, folder: true, state: true, error: true, createdAt: true },
      take: 500,
    }),
  ])
  return NextResponse.json({ storage, unfinished })
}
