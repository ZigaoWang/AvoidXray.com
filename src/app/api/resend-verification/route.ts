import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { sendVerificationEmail } from '@/lib/email'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { newToken } from '@/lib/tokens'

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

  // Looked up, written and sent after the response, which is the same for
  // every address. Awaited, the time it took said whether there was an
  // unverified account behind the address, and a mail failure answered 500
  // only for those, which said the same thing more plainly.
  after(async () => {
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { username: email.toLowerCase() }] },
      // Needs the address to resend the verification link.
      omit: { email: false }
    })
    if (!user || user.emailVerified) return

    const { token, hash } = newToken()
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: hash, verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    })
    const sent = await sendVerificationEmail(user.email, token)
    if (!sent.success) console.error('[Resend Verification] Failed to send email:', sent.error)
  })

  return NextResponse.json({ success: true })
}
