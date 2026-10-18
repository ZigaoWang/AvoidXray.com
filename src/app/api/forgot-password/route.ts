import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { sendPasswordResetEmail } from '@/lib/email'
import { readJsonObject, invalidBody } from '@/lib/requestBody'
import { newToken } from '@/lib/tokens'

export async function POST(req: NextRequest) {
  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const { email } = body
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

  // Looked up, written and sent after the response, which is the same for
  // every address. Awaited, a request for a real account took the database
  // write and the mail call longer than one for an unknown address, which
  // answered at once: the timing said who had an account.
  after(async () => {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      // Needs the address to send the reset link to.
      omit: { email: false }
    })
    if (!user) return

    const { token, hash } = newToken()
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hash, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
    })
    const sent = await sendPasswordResetEmail(user.email, token)
    if (!sent.success) console.error('[Forgot Password] Failed to send reset email:', sent.error)
  })

  return NextResponse.json({ message: 'If an account exists, a reset link has been sent' })
}
