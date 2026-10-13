import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { encode, getToken } from 'next-auth/jwt'
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
  // The version bump signs out every other session, and an outstanding reset
  // link stops working: either could otherwise undo the change.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hash,
      resetToken: null,
      resetTokenExpiry: null,
      sessionVersion: { increment: 1 },
    },
    select: { sessionVersion: true },
  })

  const response = NextResponse.json({ success: true })
  await keepThisSession(req, response, updated.sessionVersion)
  return response
}

/**
 * Re-issues the session cookie for the device that made the change, carrying
 * the new version, so changing your password signs everyone out but you.
 *
 * The cookie is rewritten under the name the request arrived with, which is
 * how next-auth chose it: the __Secure- prefix on https, the bare name on
 * plain http in development.
 */
async function keepThisSession(req: NextRequest, response: NextResponse, sessionVersion: number) {
  const name = SESSION_COOKIES.find(candidate => req.cookies.has(candidate))
  const secret = process.env.NEXTAUTH_SECRET
  if (!name || !secret) return
  const token = await getToken({ req, secret, cookieName: name })
  if (!token) return
  response.cookies.set(name, await encode({ token: { ...token, sessionVersion }, secret, maxAge: SESSION_MAX_AGE }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: name.startsWith('__Secure-'),
    maxAge: SESSION_MAX_AGE,
  })
}

const SESSION_COOKIES = ['__Secure-next-auth.session-token', 'next-auth.session-token']
/** next-auth's default session lifetime, which authOptions does not change. */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60
