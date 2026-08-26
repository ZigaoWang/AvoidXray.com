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

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() }
    }
  })

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null
    }
  })

  return NextResponse.json({ message: 'Password reset successful' })
}
