import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { movePhotos, RollNotFound, type MoveTarget } from '@/lib/library/rollActions'
import { parseIds } from '@/lib/library/requests'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/**
 * Moves photos into a roll, into a new roll, or out of every roll.
 *
 * Body: `{ ids, rollId }`, `{ ids, newRoll: { title?, copyFrom? } }` or
 * `{ ids, loose: true }`. A new roll made from part of another (a split) takes
 * that roll's details with `copyFrom`.
 */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const body = await readJsonObject(req)
  const ids = parseIds(body?.ids)
  if (!body || !ids) return invalidBody()
  let target: MoveTarget
  if (typeof body.rollId === 'string') target = { rollId: body.rollId }
  else if (body.loose === true) target = { loose: true }
  else if (body.newRoll && typeof body.newRoll === 'object') {
    const n = body.newRoll as Record<string, unknown>
    target = {
      newRoll: {
        title: typeof n.title === 'string' && n.title.trim() ? n.title.trim().slice(0, 120) : null,
        copyFrom: typeof n.copyFrom === 'string' ? n.copyFrom : null,
      },
    }
  } else return invalidBody()

  try {
    const rollId = await movePhotos(user.id, ids, target)
    return NextResponse.json({ rollId })
  } catch (error) {
    if (error instanceof RollNotFound) return NextResponse.json({ error: 'That roll is not in your library' }, { status: 404 })
    throw error
  }
}
