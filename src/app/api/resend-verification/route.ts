import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { sendVerificationEmail } from '@/lib/email'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const email = asString(body.email)
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const ip = clientIp(req.headers)
  const byIp = rateLimit(limitKey('resend-ip', ip), LIMITS.resendVerification.perIp.limit, LIMITS.resendVerification.perIp.windowMs)
  if (!byIp.ok) return tooManyRequests(byIp, 'Too many requests. Please try again later.')

  const byEmail = rateLimit(limitKey('resend-email', email), LIMITS.resendVerification.perEmail.limit, LIMITS.resendVerification.perEmail.windowMs)
  if (!byEmail.ok) return tooManyRequests(byEmail, 'Too many requests. Please try again later.')

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username: email.toLowerCase() }] },
    // Needs the address to resend the verification link.
    omit: { email: false }
  })

  // The same answer as a sent email, as forgot-password gives. A 404 and an
  // "Already verified" told anyone which addresses had accounts and which of
  // those were verified.
  if (!user || user.emailVerified) return NextResponse.json({ success: true })

  const token = crypto.randomBytes(32).toString('hex')
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken: token, verificationTokenExpiry }
  })

  const emailResult = await sendVerificationEmail(user.email, token)

  if (!emailResult.success) {
    console.error('[Resend Verification] Failed to send email:', emailResult.error)
    return NextResponse.json({
      error: 'Could not send the verification email. Try again in a few minutes.'
    }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
