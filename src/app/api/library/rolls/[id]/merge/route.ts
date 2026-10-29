import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { mergeRolls, RollNotFound } from '@/lib/library/rollActions'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/** Merges this roll into another: its photos follow the other's last frame, and this roll goes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id } = await params
  const body = await readJsonObject(req)
  if (typeof body?.intoId !== 'string') return invalidBody()
  try {
    await mergeRolls(user.id, id, body.intoId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof RollNotFound) return NextResponse.json({ error: 'That roll is not in your library' }, { status: 404 })
    throw error
  }
}
