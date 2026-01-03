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

  const user = await prisma.user.create({
    data: { email: emailLower, passwordHash, username: usernameLower, name, verificationToken }
  })

  await sendVerificationEmail(emailLower, verificationToken)

  return NextResponse.json({ id: user.id, email: user.email, needsVerification: true })
}
