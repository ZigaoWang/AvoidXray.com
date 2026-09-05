/**
 * What can be reported, and what each kind is called.
 *
 * Deliberately importing nothing. The report dialog and the overflow menus are
 * client components and need these constants; when they lived beside the
 * resolver, which queries the database, the whole query engine followed them
 * into the browser bundle.
 *
 * The resolver itself is in reports.ts, which is server only.
 *
 * Reports are polymorphic — a photo, a comment, a person or a community note —
 * so the queue has to turn `(targetType, targetId)` back into something a
 * moderator can look at. Keeping that here means the admin view and the report
 * endpoint agree on what a valid target is, and adding a fifth kind is one
 * entry rather than edits in three files.
 */

export const REPORT_TARGETS = ['photo', 'comment', 'user', 'note'] as const
export type ReportTarget = (typeof REPORT_TARGETS)[number]

/**
 * What each target is called in front of a reader.
 *
 * The menu item used to say only "Report", and on a photo page that menu sits
 * in the author's card next to Block. "Report" there could mean the photo or
 * the person, and the two go to different places. Every item names its target
 * instead, so nothing has to be inferred from where the menu happens to be.
 *
 * "user" is the column value; nobody says "report this user" about a person
 * whose profile they are looking at, so the word shown is "account".
 */
export const REPORT_TARGET_NOUNS: Record<ReportTarget, string> = {
  photo: 'photo',
  comment: 'comment',
  user: 'account',
  note: 'note',
}

export function isReportTarget(value: unknown): value is ReportTarget {
  return typeof value === 'string' && (REPORT_TARGETS as readonly string[]).includes(value)
}

export const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam or advertising' },
  { value: 'NOT_FILM', label: 'Not a film photograph' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { value: 'HARASSMENT', label: 'Harassment or abuse' },
  { value: 'COPYRIGHT', label: "Someone else's work" },
  { value: 'OTHER', label: 'Something else' },
] as const

export type ReportReasonValue = (typeof REPORT_REASONS)[number]['value']

export function isReportReason(value: unknown): value is ReportReasonValue {
  return typeof value === 'string' && REPORT_REASONS.some(r => r.value === value)
}
