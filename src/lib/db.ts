import { Prisma, PrismaClient } from '@prisma/client'

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

/**
 * Photo fields that are moderation data, not something a viewer should see.
 *
 * The nudity score was in every feed: /api/photos returns whole rows, so the
 * score and the classifier's name for every public photo went out with them.
 * Omitted the same way as the user fields above; the admin queue selects them
 * by name. `screening` stays, since the visibility checks read it from loaded
 * rows and a stranger only ever receives CLEAR photos.
 */
export const OMITTED_PHOTO_FIELDS = {
  nudityScore: true,
  nudityModel: true,
  // Where the files are and what they hash to. A key is no use without access
  // to the object, but nothing outside the storage code needs one, and the
  // original's key in particular has no business in a page.
  originalKey: true,
  thumbKey: true,
  mediumKey: true,
  largeKey: true,
  originalSha256: true,
  imageSha256: true,
  perceptualHash: true,
  // From the owner's own file. Shown to them, never to anyone else.
  originalFilename: true,
  scannerModel: true,
} as const

// Typed from the constructor so the omissions above are part of the client's
// type: a field left out is a compile error where it is read, not an
// undefined at run time.
type Client = ReturnType<typeof createPrismaClient>
const globalForPrisma = globalThis as unknown as { prisma: Client }

function createPrismaClient() {
  const options = { omit: { user: OMITTED_USER_FIELDS, photo: OMITTED_PHOTO_FIELDS } } satisfies Prisma.PrismaClientOptions
  return new PrismaClient<typeof options>(options)
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

/** The client or a transaction on it, for helpers that run inside either. */
export type DbClient = Omit<Client, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
