/**
 * Alt text and display-name helpers for photos.
 *
 * Alt text is the single biggest lever we have for Google Images: a film photo
 * has no extractable text of its own, so the alt attribute is essentially the
 * only thing describing it to a crawler. We have no EXIF, so everything here is
 * built from the metadata we actually store — caption, film stock, camera,
 * photographer, and capture date.
 */

export interface NamedEntity {
  name: string
  brand?: string | null
  /**
   * Film stocks carry a normalized manufacturer and no brand. Preferred when
   * present so display picks it up without every call site changing; cameras,
   * which have no manufacturer field, keep falling back to brand.
   */
  manufacturer?: string | null
}

export interface PhotoAltSource {
  caption?: string | null
  takenDate?: Date | string | null
  filmStock?: NamedEntity | null
  camera?: NamedEntity | null
  user?: { name?: string | null; username: string } | null
}

/**
 * "a" or "an" for a following word. Goes by sound rather than spelling where the
 * two disagree, so "an Olympus" and "an F100" are right while "a UV filter" and
 * "a One-Shot" don't get mangled.
 */
export function article(word: string): 'a' | 'an' {
  const w = word.trim()
  if (!w) return 'a'

  // Short all-caps runs are read letter by letter ("an FM2", "an AE-1"), so the
  // article follows the letter's sound. Longer all-caps runs are brand names
  // read as words — FUJICA, NIKON — and take the ordinary rule.
  const VOWEL_SOUNDING_LETTERS = new Set(['a', 'e', 'f', 'h', 'i', 'l', 'm', 'n', 'o', 'r', 's', 'x'])
  const capsRun = /^[A-Z]+/.exec(w)?.[0] ?? ''
  const isInitialism = (capsRun.length >= 2 && capsRun.length <= 3) || /^[A-Z]\d/.test(w)
  if (isInitialism) return VOWEL_SOUNDING_LETTERS.has(w[0].toLowerCase()) ? 'an' : 'a'

  const lower = w.toLowerCase()
  // "u" words that start with a "yoo" sound take "a".
  if (/^u(ni|se|ti|sa|ku)/.test(lower)) return 'a'
  // Silent "h".
  if (/^(hour|honest|honou?r|heir)/.test(lower)) return 'an'

  return 'aeiou'.includes(lower[0]) ? 'an' : 'a'
}

/** "with a Nikon FM2" / "with an Olympus 35 SP" */
function withGear(name: string): string {
  return `with ${article(name)} ${name}`
}

/** "Kodak" + "Gold 200" -> "Kodak Gold 200", avoiding a duplicated brand prefix. */
export function displayName(entity: NamedEntity | null | undefined): string | null {
  if (!entity?.name) return null
  const { name } = entity
  const maker = entity.manufacturer?.trim() || entity.brand?.trim()
  if (!maker) return name
  return name.toLowerCase().startsWith(maker.toLowerCase()) ? name : `${maker} ${name}`
}

export function photographerName(
  user: { name?: string | null; username: string } | null | undefined
): string | null {
  if (!user) return null
  return user.name?.trim() || user.username
}

/**
 * Build descriptive alt text for a photo.
 *
 * With full metadata:
 *   "Sunset over the bay — film photograph shot on Kodak Gold 200 with a Nikon FM2 by Zigao Wang"
 * With nothing but a photographer:
 *   "Film photograph by Zigao Wang"
 *
 * Kept under ~125 characters where possible, which is the practical ceiling for
 * alt text before screen readers and search engines start truncating.
 */
export function photoAlt(photo: PhotoAltSource): string {
  const film = displayName(photo.filmStock)
  const camera = displayName(photo.camera)
  const photographer = photographerName(photo.user)
  const caption = photo.caption?.trim()

  // The gear clause is the part with actual search value, so it always wins
  // space over the caption if we have to choose.
  const gear: string[] = []
  if (film) gear.push(`shot on ${film}`)
  if (camera) gear.push(withGear(camera))

  let subject = 'Film photograph'
  if (caption) {
    const short = caption.length > 70 ? `${caption.slice(0, 67).trimEnd()}…` : caption
    subject = `${short} — film photograph`
  }

  const parts = [subject, ...gear]
  if (photographer) parts.push(`by ${photographer}`)

  return parts.join(' ')
}

/**
 * A page-title-shaped version of the same information, for <title> and og:title.
 * Leads with the caption when there is one, otherwise leads with the gear so the
 * title still carries keywords.
 */
export function photoTitle(photo: PhotoAltSource): string {
  const caption = photo.caption?.trim()
  const film = displayName(photo.filmStock)
  const camera = displayName(photo.camera)
  const photographer = photographerName(photo.user)

  if (caption) {
    const short = caption.length > 60 ? `${caption.slice(0, 57).trimEnd()}…` : caption
    return photographer ? `${short} by ${photographer}` : short
  }

  const gear = [film, camera].filter(Boolean).join(' + ')
  if (gear) return photographer ? `${gear} — film photo by ${photographer}` : `${gear} — film photo`

  return photographer ? `Film photo by ${photographer}` : 'Film photo'
}

/**
 * Meta description for a photo page. Longer and more sentence-like than the alt
 * text, since this is what shows up as the search snippet.
 */
export function photoDescription(photo: PhotoAltSource): string {
  const film = displayName(photo.filmStock)
  const camera = displayName(photo.camera)
  const photographer = photographerName(photo.user)
  const caption = photo.caption?.trim()

  const sentences: string[] = []

  const lead: string[] = ['Film photograph']
  if (photographer) lead.push(`by ${photographer}`)
  if (camera) lead.push(`shot on ${article(camera)} ${camera}`)
  if (film) lead.push(`using ${film}`)
  sentences.push(`${lead.join(' ')}.`)

  if (caption) sentences.push(caption.length > 120 ? `${caption.slice(0, 117).trimEnd()}…` : caption)

  const year = photoYear(photo.takenDate)
  if (year) sentences.push(`Taken ${year}.`)

  sentences.push('View more film photography on AvoidXray.')

  return sentences.join(' ')
}

function photoYear(takenDate: Date | string | null | undefined): string | null {
  if (!takenDate) return null
  const d = takenDate instanceof Date ? takenDate : new Date(takenDate)
  return Number.isNaN(d.getTime()) ? null : String(d.getUTCFullYear())
}

/** Alt text for a film stock or camera product shot. */
export function gearImageAlt(entity: NamedEntity, kind: 'film' | 'camera'): string {
  const name = displayName(entity) ?? entity.name
  return kind === 'film' ? `${name} film stock` : `${name} film camera`
}
