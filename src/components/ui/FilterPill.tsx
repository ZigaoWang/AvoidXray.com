import { focusRing } from './focus'

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
 * What the row filters and where it keeps that choice stays with the caller.
 * This knows only whether this pill is the one that is on.
 */
export default function FilterPill({
  pressed,
  className = '',
  ...props
}: { pressed: boolean } & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={[
        'px-3 py-1.5 text-xs uppercase tracking-wide font-medium transition-colors',
        focusRing,
        pressed ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}
