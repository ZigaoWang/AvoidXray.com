import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email, password, username, name } = await req.json()

  if (!email || !password || !username) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' }, { status: 400 })
  }

  if (username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 })
  }

  const emailLower = email.toLowerCase()
  const usernameLower = username.toLowerCase()

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email: emailLower }, { username: usernameLower }] }
  })

  if (exists) {
    return NextResponse.json({ error: 'User already exists' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const verificationToken = crypto.randomBytes(32).toString('hex')
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  const user = await prisma.user.create({
    data: {
      email: emailLower,
      passwordHash,
      username: usernameLower,
      name,
      verificationToken,
      verificationTokenExpiry
    }
  })

  const emailResult = await sendVerificationEmail(emailLower, verificationToken)

  if (!emailResult.success) {
    console.error('[Register] Failed to send verification email:', emailResult.error)
    // User is created but email failed - they can resend later
    return NextResponse.json({
      id: user.id,
      email: user.email,
      needsVerification: true,
      emailWarning: 'Account created but verification email failed to send. Please use "Resend verification email".'
    })
  }

  return NextResponse.json({ id: user.id, email: user.email, needsVerification: true })
}
