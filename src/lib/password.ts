/**
 * What counts as an acceptable password.
 *
 * Registration and password reset accepted anything non-empty, while the
 * change-password form already required eight characters — so the weakest way
 * into an account was the front door. This is the settled rule for all three.
 *
 * Deliberately free of any dependency on bcrypt: the sign-up and reset forms
 * import these to state the requirement before someone submits, and hashing
 * has no business in a browser bundle. See lib/passwordHash for that half.
 */

/**
 * Eight characters, following NIST SP 800-63B: a length floor, and no
 * composition rules. Requiring a digit and a symbol measurably pushes people
 * towards "Password1!" rather than towards anything harder to guess, and the
 * real defence against guessing is the per-account limit in LIMITS.login.
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * bcrypt hashes the first 72 bytes and silently ignores the rest, which would
 * make two different long passphrases interchangeable at sign-in. Refused
 * rather than truncated, so nobody is told a password was accepted when only
 * part of it was.
 */
export const MAX_PASSWORD_BYTES = 72

/**
 * Checks a submitted password.
 *
 * @param value - Raw input of unknown shape
 * @returns A message to show the person, or null when the password is fine
 */
export function passwordProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Password is required'
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  // Bytes rather than characters — an emoji costs four of the 72 available.
  // TextEncoder rather than Buffer so this stays usable on both sides.
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) {
    return 'Password is too long. Please use something shorter.'
  }
  return null
}
