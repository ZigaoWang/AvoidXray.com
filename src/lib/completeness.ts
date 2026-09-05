import type { EntityType } from '@prisma/client'

/**
 * How complete a catalogue entry is, and how much of it anybody has checked.
 *
 * Two separate questions, deliberately kept apart. A page with every field
 * filled and nothing cited is not the same as one with half the fields filled
 * and all of them sourced, and collapsing the two into one percentage would
 * make the first look better than the second. It is the second this catalogue
 * is trying to be.
 *
 * ## The computation
 *
 * Fields are weighted, because they are not equally worth having. A film's
 * process changes what a reader can do with it; its product code does not.
 * Three tiers:
 *
 *   - **core**: the entry is not usable without it
 *   - **useful**: what someone came to the page for
 *   - **extra**: worth having, nobody misses it
 *
 * `filled` is the share of weight that has a value. `cited` is the share of
 * *filled* weight carrying a source. Cited is expressed against what is filled
 * rather than against everything, because an unfilled field is not an uncited
 * claim: it is honestly absent, and counting it as a citation failure would
 * punish leaving a gap open, which is the behaviour the catalogue wants.
 *
 * Legacy columns are excluded. They are superseded and scheduled for removal,
 * and counting them would make every entry look permanently incomplete.
 */

export type Tier = 'core' | 'useful' | 'extra'

const WEIGHT: Record<Tier, number> = { core: 3, useful: 2, extra: 1 }

/**
 * What each kind of entry is measured on.
 *
 * Only fields a person can actually supply. Derived and system columns are not
 * here, because an entry cannot be made more complete by their existing.
 */
const FIELDS: Partial<Record<EntityType, Record<string, Tier>>> = {
  FILM_STOCK: {
    summary: 'core',
    brandId: 'core',
    process: 'core',
    chromaticity: 'core',
    polarity: 'core',
    iso: 'core',
    manufacturerStatus: 'useful',
    colorBalance: 'useful',
    description: 'useful',
    aliases: 'extra',
    parentStockId: 'extra',
  },
  CAMERA: {
    summary: 'core',
    brandId: 'core',
    bodyType: 'core',
    description: 'useful',
    year: 'useful',
    format: 'useful',
    frameFormat: 'extra',
    mountType: 'extra',
    aliases: 'extra',
  },
}

export interface Completeness {
  /** Share of weighted fields carrying a value, 0 to 1. */
  filled: number
  /** Share of filled weight carrying a source, 0 to 1. */
  cited: number
  /** Names of core fields with no value, so a page can say what is missing. */
  missingCore: string[]
}

/** A value that counts as present. An empty array and an empty string do not. */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

export function completenessOf(
  entityType: EntityType,
  record: Record<string, unknown>,
  citedFields: Set<string>,
  /**
   * Fields absent from every entry, which are therefore not news about this one.
   *
   * A note that reads identically on all forty pages carries no information at
   * the point a reader sees it. A field nothing has yet is a backlog item for
   * the catalogue rather than a gap in the record in front of them, so it is
   * left out until it is the exception rather than the rule.
   */
  universallyMissing: ReadonlySet<string> = new Set()
): Completeness | null {
  const fields = FIELDS[entityType]
  if (!fields) return null

  let totalWeight = 0
  let filledWeight = 0
  let citedWeight = 0
  const missingCore: string[] = []

  for (const [field, tier] of Object.entries(fields)) {
    const weight = WEIGHT[tier]
    totalWeight += weight

    if (!hasValue(record[field])) {
      if (tier === 'core' && !universallyMissing.has(field)) missingCore.push(field)
      continue
    }

    filledWeight += weight
    if (citedFields.has(field)) citedWeight += weight
  }

  return {
    filled: totalWeight === 0 ? 0 : filledWeight / totalWeight,
    // Against filled weight, not total. An absent field is not an uncited claim.
    cited: filledWeight === 0 ? 0 : citedWeight / filledWeight,
    missingCore,
  }
}

/**
 * Fields that no entry has yet, so mentioning them says nothing.
 *
 * Hardcoded rather than counted, because counting means a query per page for a
 * fact that changes twice a year. Remove an entry from here the moment the
 * field is mostly populated, at which point its absence becomes worth saying.
 */
export const NOT_YET_STARTED: ReadonlySet<string> = new Set([
  // Added with the writing standard; the rewrite pass fills it entry by entry.
  'summary',
])

/**
 * The word shown to a reader.
 *
 * Deliberately four coarse steps rather than a percentage. A percentage invites
 * treating the number as the goal, and 80% complete says nothing useful about
 * whether the thing a reader came for is present.
 */
export function completenessLabel(c: Completeness): string {
  if (c.missingCore.length > 0) return 'Incomplete'
  if (c.filled >= 0.9 && c.cited >= 0.75) return 'Well documented'
  if (c.filled >= 0.6) return 'Documented'
  return 'Sparse'
}
