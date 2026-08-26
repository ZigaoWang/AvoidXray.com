import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { passwordProblem } from '@/lib/password'
import { hashPassword } from '@/lib/passwordHash'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id

  // Limited per account rather than per address: the account is what is being
  // protected, and the caller is already known.
  const limited = enforceLimit(
    'password-change', userId, LIMITS.passwordChange.perUser,
    'Too many password change attempts. Please try again later.'
  )
  if (limited) return limited

  const body = await readJsonObject(req)

  if (!body) return invalidBody()

  const currentPassword = asString(body.currentPassword)
  const newPassword = asString(body.newPassword) ?? ''
  if (!currentPassword) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const weakPassword = passwordProblem(newPassword)
  if (weakPassword) return NextResponse.json({ error: weakPassword }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })

  const hash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } })

  return NextResponse.json({ success: true })
}
