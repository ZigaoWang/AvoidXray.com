import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { passwordProblem } from '@/lib/password'
import { hashPassword } from '@/lib/passwordHash'

export async function POST(req: NextRequest) {
  const { token, password } = await req.json()

  if (typeof token !== 'string' || !token) {
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
