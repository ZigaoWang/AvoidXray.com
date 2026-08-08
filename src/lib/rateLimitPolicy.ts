/**
 * Rate limit thresholds, kept together so they can be reviewed as a policy
 * rather than hunted for across route files.
 *
 * These are deliberately forgiving. The threat being addressed is automated
 * abuse — flooding someone's inbox, exhausting the mail quota, or grinding
 * passwords — not a person clicking twice. A limiter that locks out real users
 * is worse than the problem it solves, so every limit here allows a normal
 * person several honest attempts, including mistakes.
 */

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE

export const LIMITS = {
  /**
   * Sends mail to an address the caller does not have to own, so it is
   * limited twice: by caller, and by the address being targeted. The
   * per-address limit is the one that actually protects someone's inbox — an
   * attacker with many source addresses defeats the per-IP limit alone.
   */
  forgotPassword: {
    perIp: { limit: 5, windowMs: 15 * MINUTE },
    perEmail: { limit: 3, windowMs: HOUR },
  },

  /** Also sends mail, same reasoning. */
  resendVerification: {
    perIp: { limit: 5, windowMs: 15 * MINUTE },
    perEmail: { limit: 3, windowMs: HOUR },
  },

  /** Account creation: generous, since a household or campus shares an address. */
  register: {
    perIp: { limit: 10, windowMs: HOUR },
  },

  /**
   * Password guessing. Counted per address as well as per source, so an
   * attacker distributing attempts across many addresses still hits a wall on
   * the account being targeted.
   */
  login: {
    perIp: { limit: 20, windowMs: 15 * MINUTE },
    perIdentifier: { limit: 10, windowMs: 15 * MINUTE },
  },

  /** Discloses whether an account exists and is unverified; cheap to abuse for enumeration. */
  checkVerification: {
    perIp: { limit: 20, windowMs: 15 * MINUTE },
  },
} as const

/**
 * Namespaced bucket key.
 *
 * The namespace matters: without it a single address hitting its login limit
 * would also be blocked from requesting a password reset, since both would
 * share one counter.
 */
export function limitKey(namespace: string, value: string): string {
  return `${namespace}:${value.toLowerCase()}`
}
