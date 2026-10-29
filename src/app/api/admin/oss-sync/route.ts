import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { surveyBucket, sweepOrphans } from '@/lib/admin/ossSweep'

/** Admin-only; returns the user when authorized, otherwise a response to send. */
async function requireAdmin(): Promise<{ error: NextResponse } | { error: null }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Sign in to do that' }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    select: { isAdmin: true },
  })

  if (!user?.isAdmin) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }

  return { error: null }
}

// DELETE: Remove orphaned files from OSS that don't exist in database
export async function DELETE() {
  const { error } = await requireAdmin()
  if (error) return error

  const survey = await surveyBucket()
  const { deleted, failed } = await sweepOrphans(survey)

  return NextResponse.json({
    success: true,
    ossTotal: survey.ossTotal,
    dbTotal: survey.dbTotal,
    orphaned: survey.orphanedKeys.length,
    skipped: survey.unknownKeys.length,
    tooRecent: survey.tooRecentKeys.length,
    deleted,
    failed: failed.length,
  })
}

// GET: Check for orphaned files without deleting
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const survey = await surveyBucket()

  return NextResponse.json({
    ossTotal: survey.ossTotal,
    dbTotal: survey.dbTotal,
    orphaned: survey.orphanedKeys.length,
    skipped: survey.unknownKeys.length,
    // Held back only because they are recent; they become orphans on a later
    // run if nothing has claimed them by then.
    tooRecent: survey.tooRecentKeys.length,
    // A preview of exactly what DELETE would remove, so the decision is made
    // against the real list rather than a count.
    orphanedKeys: survey.orphanedKeys.slice(0, 20),
    unknownKeys: survey.unknownKeys.slice(0, 20),
  })
}
