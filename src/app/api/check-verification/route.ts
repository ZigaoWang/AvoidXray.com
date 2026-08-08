import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email || typeof email !== 'string') return NextResponse.json({ unverified: false })

  // Reveals whether an account exists and is unverified, so it is an account
  // enumeration oracle if called freely.
  const byIp = rateLimit(limitKey('check-verif-ip', clientIp(req.headers)), LIMITS.checkVerification.perIp.limit, LIMITS.checkVerification.perIp.windowMs)
  if (!byIp.ok) {
    return tooManyRequests(byIp, 'Too many requests. Please try again later.')
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username: email.toLowerCase() }] }
  })

  if (user && !user.emailVerified) {
    return NextResponse.json({ unverified: true })
  }

  return NextResponse.json({ unverified: false })
}
