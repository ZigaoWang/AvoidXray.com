/**
 * How a date reads on this site.
 *
 * There were nine different calls. Five passed no locale at all, which formats
 * in whatever the machine is set to — so the same comment was dated 9/3/2026
 * for one reader and 03/09/2026 for another, and neither can tell which is the
 * month. Those five also sat in client components, where the browser's locale
 * need not match the server's and the two renders can disagree outright.
 *
 * Of the four that did pass one, three said en-US and one said en-GB, so the
 * admin's feedback queue was dating things "3 September 2026" while the photo
 * page beside it said "Sep 3, 2026".
 *
 * One locale, fixed, and one shape per purpose.
 */

const LOCALE = 'en-US'

/**
 * The default: "3 Sep 2026" is ambiguous to nobody and stays short enough for
 * a byline. Used for comments, notifications and anything in a list.
 */
export function formatDate(value: Date | string | number): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * For a date that describes the photograph rather than the record — when the
 * frame was taken.
 *
 * Fixed to UTC deliberately. A capture date is a calendar date, not an instant;
 * rendered in the reader's zone, a photo taken on the 1st shows as the 31st to
 * anyone far enough west, which is simply the wrong day.
 */
export function formatCaptureDate(value: Date | string | number): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** "September 2026", for a join date where the day is noise. */
export function formatMonth(value: Date | string | number): string {
  return toDate(value).toLocaleDateString(LOCALE, { year: 'numeric', month: 'long' })
}

/** "Wednesday, September 3, 2026", for a heading naming one day. */
export function formatLongDate(value: Date | string | number): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}
