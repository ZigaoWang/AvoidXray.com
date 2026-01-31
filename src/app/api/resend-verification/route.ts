import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username: email.toLowerCase() }] }
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (user.emailVerified) return NextResponse.json({ error: 'Already verified' }, { status: 400 })

  const token = crypto.randomBytes(32).toString('hex')
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken: token, verificationTokenExpiry }
  })

  const emailResult = await sendVerificationEmail(user.email, token)

  if (!emailResult.success) {
    console.error('[Resend Verification] Failed to send email:', emailResult.error)
    return NextResponse.json({
      error: 'Failed to send verification email. Please try again later.'
    }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
