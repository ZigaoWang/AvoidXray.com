import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

  if (!user) {
    return NextResponse.json({ message: 'If an account exists, a reset link has been sent' })
  }

  const resetToken = crypto.randomBytes(32).toString('hex')
  const resetTokenExpiry = new Date(Date.now() + 3600000)

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry }
  })

  await sendPasswordResetEmail(user.email, resetToken)

  return NextResponse.json({ message: 'If an account exists, a reset link has been sent' })
}
