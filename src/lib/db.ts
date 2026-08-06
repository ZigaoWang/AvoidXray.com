import { PrismaClient } from '@prisma/client'

/**
 * User fields that must never leave the server by accident.
 *
 * These are omitted globally, so any query that doesn't explicitly ask for them
 * gets a result without them. That makes the dangerous case fail closed: an
 * `include: { user: true }` — which returns every scalar on the model and is how
 * credentials leaked from /api/photos and /api/cameras/[id] — now yields a user
 * object with no secrets in it at all.
 *
 * Two ways to opt back in, both of which have to be named at the call site:
 *   - `omit: { passwordHash: false }` on the query, or
 *   - an explicit `select: { passwordHash: true }`, which takes precedence over
 *     a global omit (verified against Prisma 6.19).
 *
 * `email` is included because a user's address is personal data with no reason
 * to appear in a public payload; the handful of flows that genuinely need it
 * (login, password reset, verification email, the admin user table) opt in.
 */
export const OMITTED_USER_FIELDS = {
  passwordHash: true,
  email: true,
  resetToken: true,
  resetTokenExpiry: true,
  verificationToken: true,
  verificationTokenExpiry: true,
} as const

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  return new PrismaClient({
    omit: { user: OMITTED_USER_FIELDS },
  })
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
