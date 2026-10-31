import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { ROLL_SELECT, rollDetailsData, rollView, type RollDetailsInput } from '@/lib/library/rollFields'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/** A roll's details, as the import page shows them. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const { id } = await params
  const roll = await prisma.roll.findFirst({ where: { id, ownerId: user.id }, select: ROLL_SELECT })
  return roll ? NextResponse.json({ roll: rollView(roll) }) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

/**
 * Changes a roll's details. Fields left out are left alone and null clears
 * one. The roll's photos take the new details (`Roll_details_to_photos`).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const checked = await rollDetailsData(body as RollDetailsInput)
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 })

  try {
    const { count } = await prisma.roll.updateMany({ where: { id, ownerId: user.id }, data: checked.data })
    if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (error) {
    if (String(error).includes('Roll_shot_range_in_order')) {
      return NextResponse.json({ error: 'The last shot date is before the first' }, { status: 400 })
    }
    throw error
  }
  const roll = await prisma.roll.findUniqueOrThrow({ where: { id }, select: ROLL_SELECT })
  return NextResponse.json({ roll: rollView(roll) })
}

/**
 * Removes a roll that has no photos left, as when the import page merges it
 * into another. Items still placed in it become loose.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const { id } = await params

  const roll = await prisma.roll.findFirst({
    where: { id, ownerId: user.id },
    select: { _count: { select: { photos: true } } },
  })
  if (!roll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (roll._count.photos) return NextResponse.json({ error: 'This roll still has photos' }, { status: 409 })
  await prisma.roll.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
