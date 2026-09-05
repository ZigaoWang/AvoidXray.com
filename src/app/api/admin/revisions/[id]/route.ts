import { NextRequest, NextResponse } from 'next/server'
import { currentUserId, requireAdmin } from '@/lib/admin/auth'
import { reviewRevision } from '@/lib/revisions'
import { readJsonObject, invalidBody } from '@/lib/requestBody'

/**
 * A decision on one proposal.
 *
 * Field level: a reviewer accepts what is right and refuses the rest with a
 * reason, which is the normal outcome for a generated batch where most of a
 * proposal is correct and one value is not.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const reviewer = await currentUserId()
  if (!reviewer) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return invalidBody()

  const approve = Array.isArray(body.approve)
    ? body.approve.filter((f): f is string => typeof f === 'string')
    : []

  // Field name to reason. A rejection is recorded as an event with its reason,
  // not as a standing judgement, so the same value can be proposed again later.
  const reject: Record<string, string> = {}
  if (body.reject && typeof body.reject === 'object') {
    for (const [field, reason] of Object.entries(body.reject as Record<string, unknown>)) {
      if (typeof field === 'string') {
        reject[field] = typeof reason === 'string' && reason.trim() ? reason.trim() : 'No reason given'
      }
    }
  }

  if (approve.length === 0 && Object.keys(reject).length === 0) {
    return NextResponse.json({ error: 'Nothing decided' }, { status: 400 })
  }

  const result = await reviewRevision(id, { approve, reject, reviewedById: reviewer })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(result)
}
