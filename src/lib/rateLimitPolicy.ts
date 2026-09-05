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

  /**
   * Changing a password while signed in, which is gated on the current one.
   *
   * That gate is what stops somebody who has borrowed a session — a shared
   * laptop, a stolen token — from turning temporary access into permanent
   * control of the account, and unlimited guesses defeat it. Each attempt also
   * costs two bcrypt operations at cost 12, so a loop here is enough to starve
   * a single-process server of CPU.
   */
  passwordChange: {
    perUser: { limit: 10, windowMs: HOUR },
  },

  /**
   * Spending a reset token. The token is 256 bits of randomness, so this is
   * not what stands between an attacker and an account; it is here so an
   * unauthenticated endpoint cannot be hammered for free database lookups.
   * Set well above someone mistyping a new password a few times.
   */
  passwordReset: {
    perIp: { limit: 10, windowMs: 15 * MINUTE },
  },

  /** Discloses whether an account exists and is unverified; cheap to abuse for enumeration. */
  checkVerification: {
    perIp: { limit: 20, windowMs: 15 * MINUTE },
  },

  /**
   * By far the most expensive endpoint here: unauthenticated, it fetches a
   * full-resolution original from object storage, composites it, and encodes
   * with mozjpeg. A handful of concurrent callers is enough to saturate the
   * box, so this is the one limit whose purpose is capacity rather than abuse.
   *
   * Sized against real use: the dialog renders a preview per option change,
   * and someone trying every style with a few toggles each is comfortably
   * inside this. Free text is debounced client-side, so typing a caption is
   * one render rather than one per keystroke.
   */
  watermark: {
    perIp: { limit: 40, windowMs: 5 * MINUTE },
  },

  /**
   * Uploads are one request per file, so this has to clear a full roll
   * without complaint — 36 frames is the normal case and contact sheets run
   * larger. Set well above that, and per account rather than per address, so
   * two people on one connection do not share an allowance.
   */
  upload: {
    perUser: { limit: 300, windowMs: HOUR },
  },

  /**
   * Replacing a profile picture. Each call decodes up to MAX_IMAGE_SIZE_MB of
   * arbitrary image bytes through sharp and writes a permanent object to the
   * bucket, which is the same cost as an upload; unlimited, it was the cheapest
   * way to spend the box's memory and fill the bucket. An avatar is changed a
   * handful of times a year, so this only stops a loop.
   */
  avatar: {
    perUser: { limit: 10, windowMs: HOUR },
  },

  /**
   * Everything a signed-in person writes that another person reads: comments,
   * community notes, and the edits that enter the moderation queue. Loose
   * enough to be invisible in conversation, tight enough that a script cannot
   * fill a page with text faster than a moderator can read it.
   */
  contentWrite: {
    perUser: { limit: 30, windowMs: 5 * MINUTE },
  },

  /**
   * Likes, follows and note votes. Higher because these are single clicks and
   * a person catching up on a feed legitimately produces a burst of them; the
   * limit exists to stop notification floods, not enthusiasm.
   */
  reaction: {
    perUser: { limit: 120, windowMs: 5 * MINUTE },
  },

  /**
   * Search fans out into several queries per request and runs unauthenticated,
   * so it is bounded by source. The bar is well above type-ahead use, which is
   * debounced in the client.
   */
  search: {
    perIp: { limit: 60, windowMs: MINUTE },
  },

  /**
   * The footer's report form, which is open to signed-out visitors on purpose:
   * somebody who cannot register or log in is exactly who most needs to reach
   * us, and an account requirement would silence them.
   *
   * That openness is also why it is limited by address as well as by account.
   * Sized for a person having a bad afternoon and reporting several genuine
   * faults in a row, not for a script.
   */
  feedback: {
    perIp: { limit: 10, windowMs: HOUR },
    perUser: { limit: 20, windowMs: HOUR },
  },

  /**
   * A follow-up in an existing thread, posted from the status page.
   *
   * Authenticated by the reference rather than by an account, so it is bounded
   * by address. Higher than the limit on new feedback because a back-and-forth
   * about one fault is a normal conversation, not a flood.
   */
  feedbackReply: {
    perIp: { limit: 30, windowMs: HOUR },
  },

  /**
   * Reminders from the status page.
   *
   * Sends mail to an address the caller does not control, so it is bounded by
   * source on top of the per-thread cooldown that does the real work. Low,
   * because one person legitimately chasing several threads in an hour is not
   * a thing that happens.
   */
  feedbackNudge: {
    perIp: { limit: 5, windowMs: HOUR },
  },

  /**
   * Looking up a status page by reference. The reference is fifty random bits,
   * so this is not what stands between an attacker and someone's report; it is
   * here so the endpoint cannot be ground for free database lookups.
   */
  feedbackLookup: {
    perIp: { limit: 60, windowMs: 15 * MINUTE },
  },

  /**
   * The duplicate check behind the add-film and add-camera dialogs.
   *
   * It reads the entire film stock or camera table and scores every row
   * against the submitted name, so its cost is the size of the catalogue on
   * every call. It ran unauthenticated and unlimited. Adding a piece of gear
   * is a rare, deliberate act — someone naming a few stocks in a sitting is
   * comfortably inside this.
   */
  duplicateCheck: {
    perUser: { limit: 30, windowMs: 5 * MINUTE },
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
