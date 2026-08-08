import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { sendVerificationEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
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

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (user.emailVerified) return NextResponse.json({ error: 'Already verified' }, { status: 400 })

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
      error: 'Failed to send verification email. Please try again later.'
    }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
