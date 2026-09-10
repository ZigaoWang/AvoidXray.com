/**
 * The labelled specifications on a camera's or a film stock's own page.
 *
 * Deliberately not the table this replaces. That one printed a row for every
 * column whether or not it held anything, hung a source link off each value
 * and closed with a note grading its own coverage — a wiki's editing furniture
 * on a page somebody opened to look at a camera. It was removed, and the data
 * behind it stayed unreachable.
 *
 * This renders only what is recorded, with no heading, no citations and no
 * coverage note. A stock with two known properties gets two lines and takes up
 * two lines' worth of the page.
 */
export default function DetailSpecs({
  specs,
}: {
  specs: Array<{ label: string; value: string }>
}) {
  if (specs.length === 0) return null

  return (
    <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-neutral-800 pt-4 text-sm">
      {specs.map((spec) => (
        <div key={spec.label} className="contents">
          <dt className="text-neutral-500">{spec.label}</dt>
          <dd className="text-neutral-200">{spec.value}</dd>
        </div>
      ))}
    </dl>
  )
}
