import { ADMIN_RESOURCES, type FieldSpec } from '@/lib/admin/resources'
import { blockedWordsMessage, hasBlockedWords } from '@/lib/wordFilter'
import { safeHttpUrl } from '@/lib/validation'

/**
 * The checks a lab's fields get before anyone else reads them.
 *
 * A lab is the first catalog entry whose every field is free text a stranger
 * typed: a name, a city, a description and a link. Cameras and films lean on
 * enums and numbers for most of theirs, and the brand they name is resolved
 * against a list. So the word filter that guards comments and captions runs
 * here too, and the website is held to http or https, because it is rendered
 * as a link.
 *
 * Shared by the add route and the propose-an-edit route so the two refuse the
 * same things in the same words.
 */

/** Fields whose text other people read, so the word filter applies. */
const FILTERED = ['name', 'aliases', 'city', 'country', 'description'] as const

/**
 * The first problem with the submitted values, or null.
 *
 * Takes the values as the routes hold them before coercion: a string, a list
 * of strings for the aliases, or null for a cleared field.
 */
export function labFieldProblem(values: Record<string, unknown>): string | null {
  const editable: Record<string, FieldSpec> = ADMIN_RESOURCES.labs.editable

  for (const field of FILTERED) {
    const value = values[field]
    const text = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : ''
    if (text && hasBlockedWords(text, 'text')) return blockedWordsMessage(editable[field].label)
  }

  const website = values.website
  if (typeof website === 'string' && website.trim() && !safeHttpUrl(website)) {
    return 'Website must be a full address starting with http:// or https://'
  }

  return null
}

/** "Valencia, Spain"; once for a city that is its own country, "Hong Kong". */
export function labPlace(lab: { city: string | null; country: string | null }): string {
  return [...new Set([lab.city, lab.country].filter(Boolean))].join(', ')
}
