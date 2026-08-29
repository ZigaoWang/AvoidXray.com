import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { currentUserId, requireAdmin } from '@/lib/admin/auth'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import {
  FEEDBACK_REPLY_MAX,
  FEEDBACK_THREAD_MAX,
  feedbackStatus,
  isFeedbackStatus,
} from '@/lib/feedback'
import { sendFeedbackReplyEmail } from '@/lib/email'

/**
 * Answers a thread: sets its status, adds a reply, or both.
 *
 * The reply is appended rather than overwriting a column, so the sender can
 * answer it and the exchange reads as a conversation. Whatever changes, the
 * sender is emailed — a queue that only changes colour in an admin panel is
 * the silent form this feature exists to replace.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const adminId = await currentUserId()

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return invalidBody()

  const status = body.status
  if (!isFeedbackStatus(status)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
  }

  const reply = asString(body.reply)?.trim() || null
  if (reply && reply.length > FEEDBACK_REPLY_MAX) {
    return NextResponse.json(
      { error: `Replies must be ${FEEDBACK_REPLY_MAX.toLocaleString('en-US')} characters or fewer` },
      { status: 400 }
    )
  }

  const existing = await prisma.feedback.findUnique({
    where: { id },
    select: {
      reference: true,
      email: true,
      status: true,
      _count: { select: { messages: true } },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (reply && existing._count.messages >= FEEDBACK_THREAD_MAX) {
    return NextResponse.json({ error: 'This thread has reached its limit.' }, { status: 409 })
  }

  const statusChanged = status !== existing.status

  // One transaction: a reply that saved while the status change failed would
  // tell the sender something had happened when the queue disagreed.
  await prisma.$transaction([
    ...(statusChanged ? [prisma.feedback.update({ where: { id }, data: { status } })] : []),
    ...(reply
      ? [
          prisma.feedbackMessage.create({
            data: { feedbackId: id, body: reply, author: 'STAFF', authorId: adminId },
          }),
        ]
      : []),
  ])

  // Nothing the sender would notice, so nothing lands in their inbox.
  const worthTelling = statusChanged || Boolean(reply)
  let emailed = false

  if (existing.email && worthTelling) {
    const copy = feedbackStatus(status)
    const result = await sendFeedbackReplyEmail({
      email: existing.email,
      reference: existing.reference,
      statusLabel: copy.label,
      statusBlurb: copy.blurb,
      reply,
      statusChanged,
    })
    emailed = result.success
  }

  return NextResponse.json({ emailed })
}
