import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { RollNotFound, reorderRoll } from '@/lib/library/rollActions'
import { parseIds } from '@/lib/library/requests'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/** Numbers the roll's frames in the order given. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const { id } = await params
  const body = await readJsonObject(req)
  const photoIds = parseIds(body?.photoIds)
  if (!photoIds) return invalidBody()
  try {
    await reorderRoll(user.id, id, photoIds)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof RollNotFound) return NextResponse.json({ error: 'That roll is not in your library' }, { status: 404 })
    throw error
  }
}
