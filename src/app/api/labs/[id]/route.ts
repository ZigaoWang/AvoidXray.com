import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { bylineUserSelect } from '@/lib/publicUser'
import { readJsonObject, invalidBody } from '@/lib/requestBody'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { applyAdminEdit, submitRevision } from '@/lib/revisions'
import { ADMIN_RESOURCES, coerceField, type FieldSpec } from '@/lib/admin/resources'
import { labFieldProblem } from '@/lib/labFields'
import { safeHttpUrl } from '@/lib/validation'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lab = await prisma.lab.findUnique({
      where: { id },
      include: { addedBy: { select: bylineUserSelect } },
    })

    if (!lab) {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 })
    }

    return NextResponse.json(lab)
  } catch (error) {
    console.error('Get lab error:', error)
    return NextResponse.json({ error: 'Could not load that lab' }, { status: 500 })
  }
}

/**
 * Proposing a change to a lab.
 *
 * The suggest-edit path cameras and films take, without the image: anyone
 * signed in may propose, a contributor's proposal becomes a revision worked in
 * /admin/revisions, and an administrator's is approved in the same call.
 *
 * The body is JSON naming only the fields being changed. A field that is
 * present and empty is a proposal to clear it, as on the camera form.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Sign in to do that' }, { status: 401 })
    }

    const userId = (session.user as { id: string }).id
    const { id: labId } = await params

    // Text entering a human review queue, limited as the camera edit is.
    const limited = enforceLimit(
      'resource-edit', userId, LIMITS.contentWrite.perUser,
      'You are submitting edits very quickly. Please wait a moment.'
    )
    if (limited) return limited

    const [lab, user] = await Promise.all([
      prisma.lab.findUnique({ where: { id: labId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    ])
    if (!lab) {
      return NextResponse.json({ success: false, error: 'Lab not found' }, { status: 404 })
    }

    const body = await readJsonObject(req)
    if (!body) return invalidBody()

    /**
     * The fields sent, checked against the one allowlist and kept only where
     * they differ from what the lab already has.
     *
     * Coerced here as well as at approval so a value that could never be
     * approved is refused now, with its reason, rather than sitting in the
     * queue until a reviewer finds it cannot be accepted. The payload is the
     * coerced value, which is what gets written if it is approved.
     */
    const editable: Record<string, FieldSpec> = ADMIN_RESOURCES.labs.editable
    const current = lab as unknown as Record<string, unknown>
    const proposed: Record<string, unknown> = {}

    for (const [field, spec] of Object.entries(editable)) {
      if (!(field in body)) continue
      const coerced = coerceField(spec, body[field])
      if ('error' in coerced) {
        return NextResponse.json({ success: false, error: coerced.error }, { status: 400 })
      }
      let value = coerced.value
      if (value === null && spec.required) {
        return NextResponse.json({ success: false, error: `${spec.label} cannot be emptied` }, { status: 400 })
      }
      if (field === 'website' && typeof value === 'string') value = safeHttpUrl(value) ?? value
      if (JSON.stringify(value) === JSON.stringify(current[field] ?? null)) continue
      proposed[field] = value
    }

    if (Object.keys(proposed).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No changes detected. Please modify at least one field.' },
        { status: 400 }
      )
    }

    const problem = labFieldProblem(proposed)
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 })

    if (user?.isAdmin) {
      const applied = await applyAdminEdit('LAB', labId, proposed, userId)
      if ('error' in applied) {
        return NextResponse.json({ success: false, error: applied.error }, { status: 400 })
      }
      // A refused field is not an error, since the rest landed, but it is said
      // rather than reported as saved.
      const refused = applied.rejected
      return NextResponse.json({
        success: true,
        message: refused.length
          ? `Saved. ${refused.join(', ')} could not be applied and ${refused.length === 1 ? 'was' : 'were'} left unchanged.`
          : 'Changes saved and approved.',
        data: await prisma.lab.findUnique({ where: { id: labId } }),
      })
    }

    const revision = await submitRevision({
      entityType: 'LAB',
      entityId: labId,
      payload: proposed,
      source: 'USER',
      submittedById: userId,
    })

    return NextResponse.json({
      success: true,
      message: 'Changes submitted successfully. Waiting for admin review.',
      data: { submissionId: revision.id },
    })
  } catch (error) {
    console.error('Lab edit error:', error)
    return NextResponse.json(
      { success: false, error: 'Could not save your changes. Try again.' },
      { status: 500 }
    )
  }
}
