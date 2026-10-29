import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { applyPhotoDetails, type PhotoDetailsInput } from '@/lib/library/photoDetails'
import { parseIds } from '@/lib/library/requests'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/**
 * Edits details on many photos at once: caption and date on all of them;
 * film, camera and lab on the loose ones, since a photo in a roll takes those
 * from its roll. `keptByRoll` counts the ones left for that reason.
 */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('photo-bulk', user.id, LIMITS.contentWrite.perUser, 'Too many changes. Wait a minute and try again.')
  if (limited) return limited

  const body = await readJsonObject(req)
  const ids = parseIds(body?.ids)
  if (!ids || !body?.changes || typeof body.changes !== 'object') return invalidBody()
  const result = await applyPhotoDetails(user.id, ids, body.changes as PhotoDetailsInput)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
