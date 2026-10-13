import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { enforceLimit, clientIp } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { passwordProblem } from '@/lib/password'
import { hashPassword } from '@/lib/passwordHash'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'

export async function POST(req: NextRequest) {
  const limited = enforceLimit(
    'password-reset', clientIp(req.headers), LIMITS.passwordReset.perIp,
    'Too many attempts. Please try again later.'
  )
  if (limited) return limited

  const body = await readJsonObject(req)

  if (!body) return invalidBody()

  const token = asString(body.token)
  const password = asString(body.password) ?? ''
  if (!token) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
  }

  // Checked before the token lookup: a reset must not be able to set a
  // password weaker than registration would have allowed.
  const weakPassword = passwordProblem(password)
  if (weakPassword) {
    return NextResponse.json({ error: weakPassword }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)

  // One statement that both checks the token and spends it, so two requests
  // carrying the same link cannot both reset the password. The version bump
  // signs out every existing session, which is the point of a reset when the
  // account may be in someone else's hands.
  const { count } = await prisma.user.updateMany({
    where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
      sessionVersion: { increment: 1 },
    },
  })

  if (count === 0) {
    // 410 so the form can tell this apart from a refused password and offer a
    // new link.
    return NextResponse.json({ error: 'This reset link has expired or was already used.' }, { status: 410 })
  }

  return NextResponse.json({ message: 'Password reset successful' })
}
