import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { clientIp, enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import {
  awaitingStaffReply,
  normalizeFeedbackReference,
  nudgeAvailableAt,
  waitDescription,
} from '@/lib/feedback'
import { sendAdminFeedbackNudge } from '@/lib/email'

/**
 * Asks us to look at a thread again.
 *
 * This sends mail to an address the caller does not control, so it is guarded
 * three ways: only when the thread is actually waiting on a reply, only once
 * per cooldown per thread, and only so often per source address. The per-thread
 * check is the one that matters, since it is enforced from a column rather
 * than from anything the browser holds.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const limited = enforceLimit(
    'feedbackNudge', clientIp(req.headers), LIMITS.feedbackNudge.perIp,
    'Too many reminders in a short time. Please wait a while.'
  )
  if (limited) return limited

  const { reference } = await params
  const normalized = normalizeFeedbackReference(decodeURIComponent(reference))
  if (!normalized) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thread = await prisma.feedback.findUnique({
    where: { reference: normalized },
    select: {
      id: true,
      reference: true,
      message: true,
      email: true,
      status: true,
      createdAt: true,
      lastNudgeAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { author: true, createdAt: true },
      },
    },
  })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!awaitingStaffReply(thread.messages)) {
    return NextResponse.json(
      { error: 'This thread has already been answered.' },
      { status: 409 }
    )
  }

  const lastActivityAt =
    thread.messages.length > 0
      ? thread.messages[thread.messages.length - 1].createdAt
      : thread.createdAt

  const availableAt = nudgeAvailableAt(lastActivityAt, thread.lastNudgeAt)
  if (availableAt) {
    return NextResponse.json(
      { error: `You can send another reminder ${waitDescription(availableAt)}.` },
      { status: 429 }
    )
  }

  // Stamped before the send, so a mail failure cannot be retried into a flood.
  await prisma.feedback.update({ where: { id: thread.id }, data: { lastNudgeAt: new Date() } })

  const result = await sendAdminFeedbackNudge({
    reference: thread.reference,
    message: thread.message,
    email: thread.email,
    waitingSince: lastActivityAt,
  }).catch(() => ({ success: false }))

  return NextResponse.json({ sent: result.success })
}
