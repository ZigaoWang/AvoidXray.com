import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { clientIp, enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { asString, invalidBody, readJsonObject } from '@/lib/requestBody'
import {
  FEEDBACK_REPLY_MAX,
  FEEDBACK_REPLY_MIN,
  FEEDBACK_THREAD_MAX,
  normalizeFeedbackReference,
} from '@/lib/feedback'
import { sendAdminFeedbackReplyNotification } from '@/lib/email'

/**
 * A follow-up from the person who sent the feedback.
 *
 * Authenticated by the reference alone, which is the same capability that
 * opens the status page — there is no account behind a signed-out sender to
 * check against. That is why this is limited by address and why a thread has a
 * ceiling: anyone holding a reference can post to that one thread, and nothing
 * else.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const limited = enforceLimit(
    'feedbackReply', clientIp(req.headers), LIMITS.feedbackReply.perIp,
    'Too many replies in a short time. Please wait a moment.'
  )
  if (limited) return limited

  const { reference } = await params
  const normalized = normalizeFeedbackReference(decodeURIComponent(reference))
  if (!normalized) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await readJsonObject(req)
  if (!body) return invalidBody()

  const message = asString(body.body)?.trim() ?? ''
  if (message.length < FEEDBACK_REPLY_MIN) {
    return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 })
  }
  if (message.length > FEEDBACK_REPLY_MAX) {
    return NextResponse.json(
      { error: `Replies must be ${FEEDBACK_REPLY_MAX.toLocaleString('en-US')} characters or fewer.` },
      { status: 400 }
    )
  }

  const thread = await prisma.feedback.findUnique({
    where: { reference: normalized },
    select: {
      id: true,
      reference: true,
      kind: true,
      email: true,
      _count: { select: { messages: true } },
    },
  })
  // Same answer as an unknown reference, so this cannot be used to work out
  // which references exist.
  if (!thread) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (thread._count.messages >= FEEDBACK_THREAD_MAX) {
    return NextResponse.json(
      { error: 'This conversation has reached its limit. Please start a new message.' },
      { status: 409 }
    )
  }

  const created = await prisma.feedbackMessage.create({
    data: { feedbackId: thread.id, body: message, author: 'SENDER' },
    select: { id: true, body: true, author: true, createdAt: true },
  })

  // Best effort, and never throws: the reply is saved either way, and it is
  // visible in the queue whether or not the notification goes out.
  await sendAdminFeedbackReplyNotification({
    reference: thread.reference,
    message,
    email: thread.email,
  }).catch(() => null)

  return NextResponse.json({
    id: created.id,
    body: created.body,
    author: created.author,
    createdAt: created.createdAt.toISOString(),
  })
}
