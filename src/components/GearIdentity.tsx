import { brandLine, modelName, type NamedEntity } from '@/lib/seo/alt'

/**
 * What a camera or a film is called, wherever it is named.
 *
 * One component, because every surface used to decide for itself: the detail
 * pages printed a maker line only when the name did not already repeat it, the
 * index cards printed the whole name and no maker at all, and the profile and
 * search cards were copies of the index that had started to drift. Which one a
 * record got came down to how its name was typed — "Canon AE-1 Program" got a
 * bare title while "F4" got a red NIKON above it.
 *
 * The brand is part of the name, not a property of it.
 *
 * An earlier pass at this put the brand on its own line above the model, which
 * looked tidy in a grid and read wrong: the thing is not an AF-1 made by
 * Olympus, it is an Olympus AF-1, and nobody shooting a bare "400" calls it
 * anything but Fujifilm 400. A line of its own turns half the name into a
 * label sitting beside the object.
 *
 * So the full name is the title, on one line, and the brand simply carries
 * less weight inside it: quieter, lighter, still the same size, so the eye
 * lands on the model and the sentence still reads whole. Classifying by brand
 * is what the filters and the labeled rows are for.
 */

const VARIANTS = {
  /** The h1 at the top of a detail page. */
  hero: {
    wrapper: 'mb-3 text-2xl font-bold leading-tight tracking-tight md:text-3xl',
    brand: 'font-medium text-neutral-400',
    model: 'text-white',
  },
  /** The full-width card in the /cameras, /films, search and profile grids. */
  card: {
    wrapper: 'truncate text-lg font-bold transition-colors group-hover:text-brand',
    brand: 'font-medium text-neutral-400 transition-colors group-hover:text-brand',
    model: 'text-white transition-colors group-hover:text-brand',
  },
  /** The narrower card a photo page puts two of side by side. */
  compact: {
    wrapper: 'truncate font-semibold transition-colors group-hover:text-brand',
    brand: 'font-normal text-neutral-400 transition-colors group-hover:text-brand',
    model: 'text-white transition-colors group-hover:text-brand',
  },
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
  const style = VARIANTS[variant]
  const brand = brandLine(gear)

  // One heading holding both spans, rather than an element per line. A record
  // whose heading read "AE-1 Program" alone dropped the brand from what a
  // crawler weighs and from what a screen reader announces when it jumps
  // between headings, with the word sitting right there on screen.
  return (
    <Heading className={style.wrapper}>
      {brand && <span className={style.brand}>{brand} </span>}
      <span className={style.model}>{modelName(gear)}</span>
    </Heading>
  )
}
