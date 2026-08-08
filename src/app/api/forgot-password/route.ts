import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { sendPasswordResetEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Per-source limit first: cheap, and stops a single abuser outright.
  const ip = clientIp(req.headers)
  const byIp = rateLimit(limitKey('forgot-pw-ip', ip), LIMITS.forgotPassword.perIp.limit, LIMITS.forgotPassword.perIp.windowMs)
  if (!byIp.ok) {
    return tooManyRequests(byIp, 'Too many reset requests. Please try again later.')
  }

  // Per-address limit is what actually protects the inbox: the caller does not
  // have to own this address, and a distributed abuser defeats the IP limit.
  const byEmail = rateLimit(limitKey('forgot-pw-email', email), LIMITS.forgotPassword.perEmail.limit, LIMITS.forgotPassword.perEmail.windowMs)
  if (!byEmail.ok) {
    // Same wording and status as the IP case, so this cannot be used to probe
    // which addresses have already been targeted.
    return tooManyRequests(byEmail, 'Too many reset requests. Please try again later.')
  }

  // Needs the address to send the reset link to.
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    omit: { email: false }
  })

  if (!user) {
    return NextResponse.json({ message: 'If an account exists, a reset link has been sent' })
  }

  const resetToken = crypto.randomBytes(32).toString('hex')
  const resetTokenExpiry = new Date(Date.now() + 3600000)

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry }
  })

  const emailResult = await sendPasswordResetEmail(user.email, resetToken)

  if (!emailResult.success) {
    console.error('[Forgot Password] Failed to send reset email:', emailResult.error)
    // Don't reveal if user exists, but log the error
  }

  // Always return success message for security (don't reveal if user exists)
  return NextResponse.json({ message: 'If an account exists, a reset link has been sent' })
}
