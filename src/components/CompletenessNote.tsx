import { completenessLabel, type Completeness } from '@/lib/completeness'

/**
 * How complete an entry is, said quietly at the foot of the page.
 *
 * The point is to invite correction rather than to grade the entry, so it names
 * what is missing instead of showing a score. "Incomplete: process, ISO" tells
 * a reader who knows the answer exactly what to supply; "62%" tells them
 * nothing they can act on.
 */
export default function CompletenessNote({
  completeness,
  labelFor,
}: {
  completeness: Completeness | null
  /** Turns a field name into the words the forms use for it. */
  labelFor?: (field: string) => string
}) {
  if (!completeness) return null

  const label = completenessLabel(completeness)
  const missing = completeness.missingCore.map(f => labelFor?.(f) ?? f)

  const { cited, editorial } = completeness.claims
  const claimSummary =
    cited + editorial === 0
      ? null
      : `${cited} sourced ${cited === 1 ? 'statement' : 'statements'}` +
        (editorial ? `, ${editorial} written as description.` : '.')

  return (
    <p className="mt-8 border-t border-neutral-900 pt-4 text-xs text-neutral-600">
      <span className="text-neutral-500">{label}.</span>{' '}
      {missing.length > 0 ? (
        <>
          Still missing {missing.join(', ').toLowerCase()}. If you know it, you can
          suggest it.
        </>
      ) : completeness.cited < 0.75 ? (
        <>Some of this has no source recorded yet.</>
      ) : (
        <>Every field here has a source.</>
      )}
      {/* Composition, not just coverage. An entry can read as fully cited while
          being mostly house voice with a couple of facts hanging off it, and
          that should be visible rather than smoothed over. */}
      {claimSummary && <> {claimSummary}</>}
    </p>
  )
}
