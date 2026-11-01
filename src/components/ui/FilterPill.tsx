import { focusRing, focusRingInset } from './focus'

/**
 * One choice in a row of narrowing controls: a view, a preset, a saved query.
 *
 * Three screens had written this out by hand — the admin table's presets, the
 * photo manager's filters, the album picker's two views — down to the same
 * `px-3 py-1.5`, the same uppercase tracking and the same lit and unlit colors.
 * Two of the three had no focus indicator at all, so the rows could be tabbed
 * onto and not seen.
 *
 * A button and not a link: every one of these swaps what a client component is
 * showing without changing the address, so there is nothing to navigate to.
 * `pressed` is required rather than optional because that is the whole state a
 * pill carries, and `aria-pressed` is what tells a screen reader which of the
 * row is the one currently in force — a color change says nothing.
 *
 * Drawn as the catalog filter chips are, h-8 inside a border. It was a 28px
 * borderless word, so on Your photos it sat in a row of 40px pickers and
 * looked like a label rather than something to press.
 *
 * What the row filters and where it keeps that choice stays with the caller.
 * This knows only whether this pill is the one that is on.
 */
/**
 * The pill's look, for a chip that has to be a link because its choice lives
 * in the address: an applied catalog filter, a related gear link, "Search
 * everywhere instead". `inset` draws the focus ring inside, for chips in a row
 * that scrolls, where an outside ring is clipped.
 */
export function filterPillClass(pressed: boolean, { inset = false }: { inset?: boolean } = {}) {
  return [
    'inline-flex h-8 shrink-0 items-center gap-1.5 border px-3 text-xs transition-colors',
    inset ? focusRingInset : focusRing,
    pressed
      ? 'border-neutral-500 bg-neutral-800 text-white'
      : 'border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white',
  ].join(' ')
}

export default function FilterPill({
  pressed,
  className = '',
  ...props
}: { pressed: boolean } & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`${filterPillClass(pressed)} ${className}`.trim()}
      {...props}
    />
  )
}
