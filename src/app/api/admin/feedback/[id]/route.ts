import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { feedbackStatus, isFeedbackStatus } from '@/lib/feedback'
import { sendFeedbackReplyEmail } from '@/lib/email'

/** Long enough for a real answer, short enough to stay an email. */
const REPLY_MAX = 2000

/**
 * Answers a report: sets its status and, optionally, writes the note the
 * reporter is sent.
 *
 * The email is the point. A queue that only changes colour in an admin panel
 * is the silent form this feature exists to replace, so a status change always
 * attempts a send when there is an address to send to.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return invalidBody()

  const status = body.status
  if (!isFeedbackStatus(status)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
  }

  const reply = asString(body.reply)?.trim() || null
  if (reply && reply.length > REPLY_MAX) {
    return NextResponse.json(
      { error: `Replies must be ${REPLY_MAX} characters or fewer` },
      { status: 400 }
    )
  }

  const existing = await prisma.feedback.findUnique({
    where: { id },
    select: { reference: true, email: true, status: true, reply: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  // Only stamped when the note itself changes, so re-saving the same answer
  // does not tell the reporter it was written again today.
  const replyChanged = reply !== existing.reply

  const updated = await prisma.feedback.update({
    where: { id },
    data: {
      status,
      reply,
      ...(replyChanged ? { repliedAt: reply ? new Date() : null } : {}),
    },
    select: { id: true, reference: true, status: true, reply: true, repliedAt: true },
  })

  // Nothing the reporter would notice, so nothing lands in their inbox.
  const worthTelling = status !== existing.status || replyChanged
  let emailed = false

  if (existing.email && worthTelling) {
    const copy = feedbackStatus(status)
    // Never throws: the status change is saved regardless, and the reporter can
    // still read it on their status page if the mail does not go out.
    const result = await sendFeedbackReplyEmail({
      email: existing.email,
      reference: existing.reference,
      statusLabel: copy.label,
      statusBlurb: copy.blurb,
      reply,
    })
    emailed = result.success
  }

  return NextResponse.json({ ...updated, emailed })
}
