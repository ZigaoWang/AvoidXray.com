import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isUniqueViolation } from '@/lib/prismaErrors'
import { clientIp, enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_PAGE_URL_MAX,
  FEEDBACK_USER_AGENT_MAX,
  generateFeedbackReference,
  isFeedbackKind,
  looksLikeEmail,
} from '@/lib/feedback'
import { sendAdminFeedbackNotification, sendFeedbackReceivedEmail } from '@/lib/email'

/**
 * How many times to retry a reference collision before giving up.
 *
 * At fifty bits a collision is not a thing that happens, but the column is
 * unique and an insert that loses the race should retry rather than show the
 * reporter an error for something that is not their problem.
 */
const REFERENCE_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null

  // Limited by address whether or not there is an account, because the form is
  // deliberately open to signed-out visitors. A signed-in reporter is limited
  // by account as well, so one person cannot get a fresh allowance by moving
  // between networks.
  const ipLimited = enforceLimit(
    'feedback', clientIp(req.headers), LIMITS.feedback.perIp,
    'Too many messages in a short time. Please wait before sending another.'
  )
  if (ipLimited) return ipLimited

  if (userId) {
    const userLimited = enforceLimit(
      'feedbackUser', userId, LIMITS.feedback.perUser,
      'Too many messages in a short time. Please wait before sending another.'
    )
    if (userLimited) return userLimited
  }

  const body = await readJsonObject(req)
  if (!body) return invalidBody()

  // Honeypot. A field positioned off-screen and hidden from assistive
  // technology, which a person never sees and a form-filling bot completes.
  // Answered with the same success shape as a real submission so that whoever
  // is on the other end learns nothing from the response.
  if (asString(body.website)) {
    return NextResponse.json({ reference: generateFeedbackReference() })
  }

  const kind = body.kind
  if (!isFeedbackKind(kind)) {
    return NextResponse.json({ error: 'Please choose what kind of message this is.' }, { status: 400 })
  }

  const message = asString(body.message)?.trim() ?? ''
  if (message.length < FEEDBACK_MESSAGE_MIN) {
    return NextResponse.json(
      { error: 'Please add more detail.' },
      { status: 400 }
    )
  }
  if (message.length > FEEDBACK_MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Please keep this under ${FEEDBACK_MESSAGE_MAX.toLocaleString('en-US')} characters.` },
      { status: 400 }
    )
  }

  // A signed-in sender is reachable at the address on their account, so the
  // form does not ask them for one. Only a signed-out sender may supply it,
  // which also means the field cannot be used to send mail to a third party
  // from an authenticated session.
  //
  // Required rather than optional. The point of this queue is that somebody
  // answers, and an anonymous message cannot be answered. It can only be read
  // and closed, which is what this queue was built to avoid.
  let email: string | null = null
  if (userId) {
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    email = account?.email ?? null
  } else {
    const supplied = asString(body.email)?.trim()
    if (!supplied) {
      return NextResponse.json(
        { error: 'Please add an email address so we can reply.' },
        { status: 400 }
      )
    }
    if (!looksLikeEmail(supplied)) {
      return NextResponse.json(
        { error: 'That email address does not look right.' },
        { status: 400 }
      )
    }
    email = supplied
  }

  // Context, so nobody has to describe their own browser. Truncated rather
  // than validated: it is never the point of the report, and a strange value
  // must not be able to cost someone the message they just typed.
  const pageUrl = asString(body.pageUrl)?.trim().slice(0, FEEDBACK_PAGE_URL_MAX) || null
  const userAgent = req.headers.get('user-agent')?.slice(0, FEEDBACK_USER_AGENT_MAX) || null

  let created: { id: string; reference: string } | null = null
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      created = await prisma.feedback.create({
        data: {
          reference: generateFeedbackReference(),
          kind,
          message,
          email,
          userId,
          pageUrl,
          userAgent,
        },
        select: { id: true, reference: true },
      })
      break
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // Collided on `reference`; go round again with a new one.
    }
  }

  if (!created) {
    console.error('[Feedback] Could not allocate a unique reference')
    return NextResponse.json(
      { error: 'Something went wrong saving that. Please try again.' },
      { status: 500 }
    )
  }

  // Both sends are best-effort and neither throws. The report is saved either
  // way, and losing it because the mail service is down would be the worse
  // outcome. The sender still has their reference and the status page.
  const openCount = await prisma.feedback.count({ where: { status: 'OPEN' } })
  await Promise.allSettled([
    sendAdminFeedbackNotification({
      reference: created.reference,
      kind,
      message,
      email,
      pageUrl,
      openCount,
    }),
    email
      ? sendFeedbackReceivedEmail({ email, reference: created.reference, kind, message })
      : Promise.resolve(null),
  ])

  return NextResponse.json({ reference: created.reference })
}
