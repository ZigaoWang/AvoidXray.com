import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import { asString, invalidBody, readJsonObject } from '@/lib/requestBody'

/**
 * An admin's decision on a photo the nudity check held.
 *
 * - approve: the flag was wrong. The photo becomes public, if its owner set it
 *   public, and its score is kept so the check does not hold it again.
 * - reject: the flag was right. It stays hidden from everyone but its owner.
 *
 * Both can be undone from the same page, so neither deletes anything.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const action = asString(body.action)
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const { id } = await params
  const { count } = await prisma.photo.updateMany({
    where: { id, screening: action === 'approve' ? { in: ['HELD', 'REJECTED'] } : 'HELD' },
    data: { screening: action === 'approve' ? 'CLEAR' : 'REJECTED' },
  })
  if (count === 0) {
    return NextResponse.json({ error: 'That photo is not waiting for a decision' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
