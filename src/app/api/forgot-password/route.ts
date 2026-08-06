import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
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
