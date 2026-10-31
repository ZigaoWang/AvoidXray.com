import type { DatePrecision, Prisma } from '@prisma/client'
import { formatRollDate } from '@/lib/library/rollFields'
import { rollHeader, shotDates } from '@/lib/library/rollHeader'
import { displayName } from '@/lib/seo/alt'

/**
 * A roll as the public side shows it: its name and the line under it, on its
 * own page, on a profile's Rolls tab and on a photo's page.
 *
 * Only what the plan put on a public roll: title, shot dates, film, camera and
 * lab. The location, notes, scanner and EI are the owner's records and stay in
 * their library. Every count beside a roll counts published photos only.
 */
export const PUBLIC_ROLL_SELECT = {
  id: true,
  ownerId: true,
  title: true,
  shotFrom: true,
  shotFromPrecision: true,
  shotTo: true,
  shotToPrecision: true,
  filmStock: { select: { id: true, slug: true, name: true, brand: true, manufacturer: true } },
  camera: { select: { id: true, slug: true, name: true, brand: true } },
  lab: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.RollSelect

export type PublicRoll = Prisma.RollGetPayload<{ select: typeof PUBLIC_ROLL_SELECT }>

function dates(roll: { shotFrom: Date | null; shotFromPrecision: DatePrecision | null; shotTo: Date | null; shotToPrecision: DatePrecision | null }) {
  return shotDates(formatRollDate(roll.shotFrom, roll.shotFromPrecision), formatRollDate(roll.shotTo, roll.shotToPrecision))
}

/**
 * "Kodak Gold 200 · Konica Big Mini" over "Oct 12, 2026 · Irohas" for a roll
 * with no title; a titled roll keeps the whole header line under its title.
 */
export function publicRollText(roll: PublicRoll): { name: string; line: string } {
  const film = roll.filmStock ? displayName(roll.filmStock) ?? roll.filmStock.name : null
  const camera = roll.camera ? displayName(roll.camera) ?? roll.camera.name : null
  const lab = roll.lab?.name ?? null
  const shot = dates(roll)
  if (roll.title) {
    return { name: roll.title, line: rollHeader({ shotFrom: formatRollDate(roll.shotFrom, roll.shotFromPrecision), shotTo: formatRollDate(roll.shotTo, roll.shotToPrecision), filmStock: film, camera, lab }) }
  }
  const gear = [film, camera].filter(Boolean).join(' · ')
  return { name: gear || 'Untitled roll', line: [shot, lab].filter(Boolean).join(' · ') }
}

/**
 * "12 photos". Every count on a public page is of published photos, so it
 * says photos; "published" is the library's word, beside the private ones.
 */
export function photoCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'photo' : 'photos'}`
}
