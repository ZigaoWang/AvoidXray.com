import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { isReportReason, isReportTarget, resolveTarget, targetExists, type ReportTarget } from '@/lib/reports'
import { sendAdminReportNotification } from '@/lib/email'
import { isUniqueViolation } from '@/lib/prismaErrors'

const MAX_DETAIL = 1000

/**
 * Files a report for a moderator to look at.
 *
 * Signed-in only: an anonymous report queue is a queue of noise, and knowing
 * who filed it is what makes the one-report-per-person rule meaningful.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to report something' }, { status: 401 })
  const reporterId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'report', reporterId, LIMITS.contentWrite.perUser,
    'Too many reports at once. Please wait a moment.'
  )
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const { targetType, targetId, reason, detail } = (body ?? {}) as Record<string, unknown>

  if (!isReportTarget(targetType) || typeof targetId !== 'string' || !targetId) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }
  if (!isReportReason(reason)) {
    return NextResponse.json({ error: 'Please choose a reason' }, { status: 400 })
  }
  if (detail !== undefined && detail !== null && typeof detail !== 'string') {
    return NextResponse.json({ error: 'Invalid detail' }, { status: 400 })
  }
  const trimmedDetail = typeof detail === 'string' ? detail.trim().slice(0, MAX_DETAIL) : null

  if (!(await targetExists(targetType, targetId))) {
    return NextResponse.json({ error: 'That no longer exists' }, { status: 404 })
  }

  // Reporting yourself is always a mistake, and reporting your own photo is
  // almost always one; either way it is not something a moderator can act on.
  if (targetType === 'user' && targetId === reporterId) {
    return NextResponse.json({ error: 'You cannot report yourself' }, { status: 400 })
  }

  try {
    await prisma.report.create({
      data: { targetType, targetId, reason, detail: trimmedDetail || null, reporterId },
    })
  } catch (error) {
    // The unique constraint is the point: a second report from the same person
    // is not a stronger signal, so it is treated as already done rather than
    // as an error the reporter has to make sense of.
    if (!isUniqueViolation(error)) throw error
    return NextResponse.json({ ok: true, alreadyReported: true })
  }

  // Fire and forget. The report is already stored; if the mail service is
  // down, losing the report as well would be the worse outcome — so this is
  // never awaited into the response and never allowed to throw.
  void notifyAdmins(targetType, targetId, reason, trimmedDetail, reporterId)

  return NextResponse.json({ ok: true })
}

async function notifyAdmins(
  targetType: ReportTarget,
  targetId: string,
  reason: string,
  detail: string | null,
  reporterId: string
) {
  try {
    const [target, reporter, openReports] = await Promise.all([
      resolveTarget(targetType, targetId),
      prisma.user.findUnique({ where: { id: reporterId }, select: { username: true } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
    ])

    await sendAdminReportNotification({
      targetType,
      targetLabel: target.summary,
      targetUrl: target.href,
      reason,
      detail,
      reporterUsername: reporter?.username ?? 'unknown',
      openReports,
    })
  } catch (error) {
    console.error('[Reports] Could not notify admins:', error)
  }
}
