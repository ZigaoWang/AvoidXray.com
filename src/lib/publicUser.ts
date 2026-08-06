/**
 * The only User fields safe to send to a client.
 *
 * Prisma's `include: { user: true }` returns every scalar on the model, which
 * means passwordHash, email, resetToken and verificationToken. Never use a bare
 * `user: true` on anything that reaches a response body or a client component —
 * use this select instead.
 */
export const publicUserSelect = {
  id: true,
  username: true,
  name: true,
  avatar: true,
  bio: true,
  website: true,
  instagram: true,
  twitter: true,
  createdAt: true,
} as const

/** Just enough to render a byline / alt text. */
export const bylineUserSelect = {
  id: true,
  username: true,
  name: true,
  avatar: true,
} as const
