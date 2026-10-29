/**
 * The line a roll is known by: "Oct 12, 2026 · Portra 400 · Nikon FM2 ·
 * Irohas". Each part only when known; the date is the shot date the owner
 * gave, never a guess. No imports: pages and the import page bundle this.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 12, 2026" for a day, "Oct 2026" for a month, as the owner gave it. */
export function rollDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m) return ''
  return d ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`
}

/** One date, or a range when the roll took a while. */
export function shotDates(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return ''
  return to && to !== from ? `${rollDate(from)} to ${rollDate(to)}` : rollDate(from)
}

export function rollHeader(roll: {
  shotFrom?: string | null
  shotTo?: string | null
  filmStock?: string | null
  camera?: string | null
  lab?: string | null
}): string {
  return [shotDates(roll.shotFrom, roll.shotTo), roll.filmStock, roll.camera, roll.lab].filter(Boolean).join(' · ')
}
