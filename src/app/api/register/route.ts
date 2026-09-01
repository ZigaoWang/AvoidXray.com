import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { sendVerificationEmail } from '@/lib/email'
import { passwordProblem } from '@/lib/password'
import { hashPassword } from '@/lib/passwordHash'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { legalVersion } from '@/lib/legal'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const email = asString(body.email)
  const password = asString(body.password)
  const username = asString(body.username)
  const name = asString(body.name)
  if (!email || !password || !username) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Checked here and not only in the form. A record that someone agreed is
  // worth nothing if the agreement can be skipped by posting to this endpoint
  // directly, and the record is the whole point of asking.
  if (body.acceptedTerms !== true) {
    return NextResponse.json(
      { error: 'Please confirm your age and accept the terms, privacy policy and community guidelines.' },
      { status: 400 }
    )
  }

  // Registration sends a verification email, so it carries the same abuse cost
  // as the reset flow. Checked after the shape validation so malformed requests
  // do not consume a caller's allowance.
  const byIp = rateLimit(limitKey('register-ip', clientIp(req.headers)), LIMITS.register.perIp.limit, LIMITS.register.perIp.windowMs)
  if (!byIp.ok) {
    return tooManyRequests(byIp, 'Too many sign-up attempts. Please try again later.')
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' }, { status: 400 })
  }

  if (username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 })
  }

  const weakPassword = passwordProblem(password)
  if (weakPassword) {
    return NextResponse.json({ error: weakPassword }, { status: 400 })
  }

  const emailLower = email.toLowerCase()
  const usernameLower = username.toLowerCase()

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email: emailLower }, { username: usernameLower }] }
  })

  if (exists) {
    return NextResponse.json({ error: 'User already exists' }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)
  const verificationToken = crypto.randomBytes(32).toString('hex')
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  const user = await prisma.user.create({
    data: {
      email: emailLower,
      passwordHash,
      username: usernameLower,
      name,
      verificationToken,
      verificationTokenExpiry,
      // Stamped from the document itself, so the record says which wording was
      // agreed to rather than merely that something was.
      termsAcceptedAt: new Date(),
      termsVersion: await legalVersion(),
    }
  })

  const emailResult = await sendVerificationEmail(emailLower, verificationToken)

  if (!emailResult.success) {
    console.error('[Register] Failed to send verification email:', emailResult.error)
    // User is created but email failed - they can resend later
    return NextResponse.json({
      id: user.id,
      email: emailLower,
      needsVerification: true,
      emailWarning: 'Account created but verification email failed to send. Please use "Resend verification email".'
    })
  }

  return NextResponse.json({ id: user.id, email: emailLower, needsVerification: true })
}
