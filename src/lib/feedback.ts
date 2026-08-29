import { randomInt } from 'node:crypto'
import type { FeedbackKind, FeedbackStatus } from '@prisma/client'

/**
 * Site feedback: what a visitor can send, and what they are told afterwards.
 *
 * Everything the reporter reads lives here rather than in the page, so the
 * form, the status page, the admin queue and the emails cannot describe the
 * same state in four different ways.
 */

/**
 * The four kinds, each with the prompt shown in the message box.
 *
 * The prompt changes with the choice. One fixed "What were you doing, and what
 * happened?" only makes sense for a bug, and asked the wrong question of
 * everyone picking any of the other three.
 */
export const FEEDBACK_KINDS = [
  {
    value: 'BUG',
    label: 'Bug',
    placeholder: 'What were you doing, and what happened?',
  },
  {
    value: 'IDEA',
    label: 'Suggestion',
    placeholder: 'What should the site do that it does not do now?',
  },
  {
    value: 'QUESTION',
    label: 'Question',
    placeholder: 'What would you like to know?',
  },
  {
    value: 'OTHER',
    label: 'Other',
    placeholder: 'What would you like to tell us?',
  },
] as const satisfies readonly { value: FeedbackKind; label: string; placeholder: string }[]

/** The prompt for a kind, falling back to the first so the box is never bare. */
export function feedbackKindPlaceholder(kind: string): string {
  return FEEDBACK_KINDS.find((k) => k.value === kind)?.placeholder ?? FEEDBACK_KINDS[0].placeholder
}

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === 'string' && FEEDBACK_KINDS.some((k) => k.value === value)
}

export function feedbackKindLabel(kind: FeedbackKind): string {
  return FEEDBACK_KINDS.find((k) => k.value === kind)?.label ?? kind
}

/**
 * The four states, with the sentence each one shows the reporter.
 *
 * A bare "OPEN" reads as though nothing has happened. The blurb states the
 * same fact in a way that answers the question the reporter actually has,
 * which is whether anyone has seen it and what comes next.
 */
export const FEEDBACK_STATUSES = [
  {
    value: 'OPEN',
    label: 'Received',
    blurb: 'Received and not yet reviewed.',
    tone: 'neutral',
  },
  {
    value: 'PLANNED',
    label: 'Planned',
    blurb: 'Confirmed and scheduled.',
    tone: 'progress',
  },
  {
    value: 'FIXED',
    label: 'Fixed',
    blurb: 'This has been fixed.',
    tone: 'good',
  },
  {
    value: 'DECLINED',
    label: 'Not planned',
    blurb: 'No change is planned for this.',
    tone: 'muted',
  },
] as const satisfies readonly {
  value: FeedbackStatus
  label: string
  blurb: string
  tone: string
}[]

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && FEEDBACK_STATUSES.some((s) => s.value === value)
}

export function feedbackStatus(status: FeedbackStatus) {
  return FEEDBACK_STATUSES.find((s) => s.value === status) ?? FEEDBACK_STATUSES[0]
}

/**
 * The sentence shown under the status badge.
 *
 * OPEN means two different things and the fixed blurb could only describe one
 * of them. A thread with a staff reply in it was still headed "Received and
 * not yet reviewed", directly above the reply — so the page contradicted
 * itself. The wording is derived from the thread instead.
 */
export function feedbackStatusBlurb(status: FeedbackStatus, answered: boolean): string {
  if (status === 'OPEN' && answered) return 'Answered below.'
  return feedbackStatus(status).blurb
}

/** Long enough to say something, short enough not to be a support ticket. */
export const FEEDBACK_MESSAGE_MIN = 10
export const FEEDBACK_MESSAGE_MAX = 4000

/** A follow-up in an existing thread. Shorter: the context is already there. */
export const FEEDBACK_REPLY_MIN = 2
export const FEEDBACK_REPLY_MAX = 2000

/**
 * Ceiling on messages in one thread.
 *
 * The status page is opened by a reference rather than by signing in, so
 * anyone holding one can post to it. The rate limit bounds how fast; this
 * bounds how far, and a genuine exchange about a broken button does not run to
 * a hundred messages.
 */
export const FEEDBACK_THREAD_MAX = 100

/**
 * How long a thread must sit quiet before the sender can ask for a reminder,
 * and how long they must wait before asking again.
 *
 * A day. Long enough that it cannot be used to hammer an inbox, short enough
 * to be useful the morning after something was missed.
 */
export const NUDGE_COOLDOWN_HOURS = 24
const NUDGE_COOLDOWN_MS = NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000

/**
 * Whether the thread is waiting on us rather than on the sender.
 *
 * The opening message counts as theirs, so a thread nobody has answered is
 * waiting, and one whose last word is ours is not. Reminding us about a thread
 * we already replied to would just be noise.
 */
export function awaitingStaffReply(messages: readonly { author: string }[]): boolean {
  if (messages.length === 0) return true
  return messages[messages.length - 1].author !== 'STAFF'
}

/**
 * The earliest moment a reminder may be sent, or null if one may be sent now.
 *
 * Measured from the later of the last activity and the last reminder, so
 * somebody cannot send a message and immediately chase it, and cannot chase
 * twice in a day.
 */
export function nudgeAvailableAt(lastActivityAt: Date, lastNudgeAt: Date | null): Date | null {
  const since = Math.max(lastActivityAt.getTime(), lastNudgeAt?.getTime() ?? 0)
  const ready = since + NUDGE_COOLDOWN_MS
  return ready <= Date.now() ? null : new Date(ready)
}

/** "in 3 hours", "tomorrow". Whole units, because the exact minute is noise. */
export function waitDescription(until: Date, now: Date = new Date()): string {
  const hours = Math.ceil((until.getTime() - now.getTime()) / (60 * 60 * 1000))
  if (hours <= 1) return 'in an hour'
  if (hours < 24) return `in ${hours} hours`
  return 'tomorrow'
}

/** Captured context is truncated rather than rejected — it is never the point. */
export const FEEDBACK_PAGE_URL_MAX = 500
export const FEEDBACK_USER_AGENT_MAX = 400

/**
 * Crockford's base32 without I, L, O and U.
 *
 * The reference gets read off a screen and typed into another one, sometimes
 * from a photograph of it, so the alphabet excludes the characters people
 * confuse with 1, 0 and each other. U is dropped as well, which is what keeps
 * a random code from spelling something unfortunate.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 10 characters of the alphabet above: fifty bits. */
const REFERENCE_LENGTH = 10

/**
 * A reference like "AX-7QK4M2XTB9".
 *
 * This is not only a label. A signed-out reporter has no account to
 * authenticate against, so the reference is also the capability that opens
 * their status page — which is why it is generated from a CSPRNG and is fifty
 * bits wide rather than being a tidy incrementing number. `randomInt` is used
 * per character instead of reducing random bytes modulo 32, which would bias
 * the first eight letters of the alphabet.
 */
export function generateFeedbackReference(): string {
  let code = ''
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    code += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return `AX-${code}`
}

/**
 * Accepts a reference in any shape a person is likely to type it — lower case,
 * with or without the prefix or a stray hyphen — and returns the canonical
 * form, or null if it could not be one of ours.
 *
 * Normalising before the lookup means a reporter who typed their own reference
 * in lower case gets their status page rather than a "not found".
 */
export function normalizeFeedbackReference(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/^AX-?/, '').replace(/[\s-]/g, '')
  if (cleaned.length !== REFERENCE_LENGTH) return null
  for (const char of cleaned) {
    if (!ALPHABET.includes(char)) return null
  }
  return `AX-${cleaned}`
}

/**
 * Whether an address is worth attempting delivery to.
 *
 * Deliberately loose. The address is optional and its only use is replying, so
 * the cost of turning away an unusual but valid address is higher than the
 * cost of one undeliverable send.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}
