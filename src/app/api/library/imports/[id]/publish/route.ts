import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { publishPhotos } from '@/lib/library/processImportItem'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

const CHOICES = { private: 'PRIVATE', all: 'ALL', chosen: 'CHOSEN' } as const

/**
 * The owner's answer to the publish question: keep private, publish all, or
 * publish the files chosen. Photos already made are published now; the rest
 * are published by the worker as they are made. Keeping private publishes
 * nothing and unpublishes nothing: photos are private until someone says
 * otherwise.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const { id } = await params
  const body = await readJsonObject(req)
  const choice = CHOICES[body?.choice as keyof typeof CHOICES]
  const chosen = Array.isArray(body?.itemIds) ? (body.itemIds as unknown[]).filter((v): v is string => typeof v === 'string') : []
  if (!choice || (choice === 'CHOSEN' && chosen.length === 0)) return invalidBody()

  const owned = await prisma.import.count({ where: { id, userId: user.id } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.import.update({ where: { id }, data: { publishChoice: choice } }),
    prisma.importItem.updateMany({ where: { importId: id }, data: { publish: false } }),
    ...(choice === 'CHOSEN'
      ? [prisma.importItem.updateMany({ where: { importId: id, id: { in: chosen } }, data: { publish: true } })]
      : []),
  ])

  if (choice !== 'PRIVATE') {
    const ready = await prisma.importItem.findMany({
      where: {
        importId: id, state: 'DONE', photoId: { not: null },
        ...(choice === 'CHOSEN' ? { id: { in: chosen } } : {}),
        photo: { visibility: 'PRIVATE', deletedAt: null },
      },
      select: { photoId: true },
    })
    await publishPhotos(user.id, ready.map(i => i.photoId!))
  }
  return NextResponse.json({ ok: true })
}
