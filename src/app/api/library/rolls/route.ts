import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { ROLL_SELECT, rollDetailsData, rollView, type RollDetailsInput } from '@/lib/library/rollFields'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject } from '@/lib/requestBody'

/** Creates a roll, with whatever details are known yet. */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser()
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
