import { displayName, type NamedEntity } from '@/lib/seo/alt'

/**
 * What a camera or a film is called, wherever it is named.
 *
 * One component, because every surface used to decide for itself: the detail
 * pages printed a maker line only when the name did not already repeat it, the
 * index cards printed the whole name and no maker at all, and the profile and
 * search cards were copies of the index that had drifted. Which one a record
 * got came down to how its name was typed — "Canon AE-1 Program" got a bare
 * title while "F4" got a red NIKON above it.
 *
 * The name is one thing, set in one style.
 *
 * Two earlier passes split it: the maker on its own line above the model, then
 * the maker in a lighter weight in front of it. Both made half the name look
 * like a property of the other half. It is not an AF-1 made by Olympus, it is
 * an Olympus AF-1; a bare 400 is a Fujifilm 400. Whatever the record stores,
 * displayName composes the name people actually say, and it is printed plainly.
 *
 * Grouping by maker is what the filters and the labeled rows are for.
 */

const VARIANTS = {
  /** The h1 at the top of a detail page. */
  hero: 'mb-3 text-2xl font-bold leading-tight tracking-tight text-white md:text-3xl',
  /**
   * The full-width card in the /cameras, /films, search and profile grids.
   *
   * Two lines rather than one with an ellipsis: now that the maker is part of
   * the title, "Fujifilm QuickSnap Flash 400" is a normal length and truncating
   * it cost the end of the model, which is the part that identifies it.
   */
  card: 'line-clamp-2 text-lg font-bold text-white transition-colors group-hover:text-brand',
  /** The narrower card a photo page puts two of side by side. */
  compact: 'truncate font-semibold text-white transition-colors group-hover:text-brand',
}

export default function GearIdentity({
  gear,
  as: Heading = 'div',
  variant = 'card',
}: {
  gear: NamedEntity
  /** The heading level this sits at, on the page it sits on. */
  as?: 'h1' | 'h2' | 'h3' | 'div'
  variant?: keyof typeof VARIANTS
}) {
  return <Heading className={VARIANTS[variant]}>{displayName(gear) ?? gear.name}</Heading>
}
