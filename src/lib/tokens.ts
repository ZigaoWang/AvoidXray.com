import crypto from 'crypto'

/**
 * Single-use account tokens: email verification and password reset.
 *
 * The link carries the token and the database keeps only its SHA-256. They
 * were stored as sent, so anyone who could read the database or a backup could
 * reset any account with a request in flight. 256 random bits do not need a
 * slow hash: there is nothing to guess.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** A new token for a link, and the hash to store in its place. */
export function newToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex')
  return { token, hash: hashToken(token) }
}
