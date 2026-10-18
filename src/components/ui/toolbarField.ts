/**
 * A field that sits in a toolbar row: the search over a profile's photos, the
 * camera and film pickers over Your photos.
 *
 * h-8 including the border, the outer height of the sort control, the Filters
 * button and the filter chips it shares a row with. At the form height it stood
 * a step taller than the row, and the hand-made copies of this had dropped the
 * brand focus ring along the way. Still text-base on a phone, for the iOS zoom
 * described on BASE.
 *
 * A function rather than a constant because the left padding depends on what
 * sits inside the field (a search glyph, a thumbnail), and there is no class
 * merging here to let a later `pl-8` beat an earlier `px-3`.
 */
export function toolbarFieldClass(padding = 'px-3') {
  return (
    `h-8 w-full bg-transparent text-white text-base sm:text-xs ${padding} ` +
    'border border-neutral-800 placeholder:text-neutral-500 hover:border-neutral-700 ' +
    'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ' +
    'disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors'
  )
}
