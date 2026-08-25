import bcrypt from 'bcryptjs'

/**
 * Password hashing. Import only from route handlers and server components:
 * this is kept apart from lib/password so the sign-up and reset forms can
 * state the length rule without pulling bcrypt into the browser bundle.
 */

/**
 * Work factor. Registration and reset hashed at 10 while the change-password
 * route already used 12; this is the single answer. Roughly a quarter-second
 * per hash on current hardware, which is the usual balance between resisting
 * offline cracking and keeping sign-in responsive.
 */
export const BCRYPT_COST = 12

/** Hashes a password that has already passed `passwordProblem`. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}
