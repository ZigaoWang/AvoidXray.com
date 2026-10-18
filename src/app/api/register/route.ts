import { NextRequest, NextResponse } from 'next/server'
import { TOP_LEVEL_PAGES, TOP_LEVEL_PREFIXES } from '@/lib/topLevelRoutes'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { sendAccountExistsEmail, sendVerificationEmail } from '@/lib/email'
import { passwordProblem } from '@/lib/password'
import { hashPassword } from '@/lib/passwordHash'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { isUniqueViolation } from '@/lib/prismaErrors'
import { legalVersion } from '@/lib/legal'
import { VALIDATION_LIMITS } from '@/lib/validation'
import crypto from 'crypto'
import { hasBlockedWords, blockedWordsMessage } from '@/lib/wordFilter'

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
      { error: 'Please confirm your age and accept the terms, privacy policy and guidelines.' },
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

  // Sign-in looks an account up by email or username in one query, and a
  // username cannot contain "@". Without this an "email" could be someone
  // else's username and shadow their account at sign-in. 254 is the most an
  // address can be delivered to.
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' }, { status: 400 })
  }

  if (username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 })
  }

  // A profile lives at /{username}, so a name the app already uses for a page,
  // such as "explore", would be a profile nobody could reach.
  const segment = username.toLowerCase()
  if (TOP_LEVEL_PAGES.has(segment) || TOP_LEVEL_PREFIXES.has(segment)) {
    return NextResponse.json({ error: 'That username is not available' }, { status: 400 })
  }
  // Not explained: saying which word was refused teaches the next attempt.
  if (hasBlockedWords(username, 'username')) {
    return NextResponse.json({ error: 'That username is not available' }, { status: 400 })
  }
  if (name && hasBlockedWords(name, 'displayName')) {
    return NextResponse.json({ error: blockedWordsMessage('Name') }, { status: 400 })
  }

  // The display name is capped by PATCH /api/user but was unbounded on the way
  // in, so the one endpoint that needs no account at all was the way to store
  // an arbitrarily long name and have every profile and byline render it.
  if (name && name.length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Name must be ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters or fewer` }, { status: 400 }
    )
  }

  const weakPassword = passwordProblem(password)
  if (weakPassword) {
    return NextResponse.json({ error: weakPassword }, { status: 400 })
  }

  const emailLower = email.toLowerCase()
  const usernameLower = username.toLowerCase()

  // A username is public, so saying it is taken gives nothing away and is the
  // answer the person needs. An email is not: "User already exists" told
  // anyone with a list of addresses which of them had accounts here. A taken
  // address gets the same answer as a new account, and its owner gets an
  // email saying someone tried, below.
  if (await prisma.user.findUnique({ where: { username: usernameLower }, select: { id: true } })) {
    return NextResponse.json({ error: 'That username is taken' }, { status: 400 })
  }

  // Hashed whether or not the address is taken, so the two answers take as
  // long as each other.
  const passwordHash = await hashPassword(password)

  if (await prisma.user.findUnique({ where: { email: emailLower }, select: { id: true } })) {
    return accountExists(emailLower)
  }

  const verificationToken = crypto.randomBytes(32).toString('hex')
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  try {
    await prisma.user.create({
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
  } catch (error) {
    // The lookup above narrows the window but does not close it: a double
    // submit gets both requests past it, they both reach the insert, and the
    // one that loses the unique index threw a 500 instead of the answer the
    // lookup already had. Same wording as that answer, so a caller still
    // cannot tell whether it was the email or the username that was taken.
    if (!isUniqueViolation(error)) throw error
    const target = String((error as { meta?: { target?: unknown } }).meta?.target ?? '')
    if (target.includes('username')) {
      return NextResponse.json({ error: 'That username is taken' }, { status: 400 })
    }
    return accountExists(emailLower)
  }

  const emailResult = await sendVerificationEmail(emailLower, verificationToken)

  if (!emailResult.success) {
    console.error('[Register] Failed to send verification email:', emailResult.error)
    // User is created but email failed - they can resend later
    return NextResponse.json({
      email: emailLower,
      needsVerification: true,
      emailWarning: 'Account created but verification email failed to send. Please use "Resend verification email".'
    })
  }

  return NextResponse.json({ email: emailLower, needsVerification: true })
}

/**
 * The answer for an address that already has an account: the same body as a
 * new one, with the owner told by email instead of sent a verification link.
 */
async function accountExists(email: string) {
  const sent = await sendAccountExistsEmail(email)
  if (!sent.success) console.error('[Register] Failed to send account-exists email:', sent.error)
  return NextResponse.json({ email, needsVerification: true })
}
