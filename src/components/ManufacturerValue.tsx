import { manufacturerDisplay, type ManufacturerInput } from '@/lib/manufacturer'

/**
 * A film's manufacturer, wherever it appears.
 *
 * One component so the film page, the search results and the admin table cannot
 * word this differently. The distinction it carries is the point of the field,
 * and a catalogue that phrases the same claim three ways has undermined it.
 */
export default function ManufacturerValue({
  size = 'base',
  ...input
}: ManufacturerInput & { size?: 'base' | 'small' }) {
  const { value, qualifier, sourceUrl, unconfirmed } = manufacturerDisplay(input)
  const text = size === 'small' ? 'text-xs' : 'text-sm'

  return (
    <span className={text}>
      {/* Muted when it is a conclusion rather than a company, so the eye reads
          it as an absence without the words having to say so twice. */}
      <span className={unconfirmed ? 'text-neutral-500' : 'text-neutral-200'}>{value}</span>

      {qualifier && (
        <>
          {' '}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              // The link sits on the qualifier, never the name: the source
              // supports the claim that this is reported, not the company.
              className="text-neutral-500 underline decoration-neutral-700 underline-offset-2
                         hover:text-neutral-300 hover:decoration-neutral-500"
              title="Where this is reported"
            >
              ({qualifier})
            </a>
          ) : (
            <span className="text-neutral-500">({qualifier})</span>
          )}
        </>
      )}
    </span>
  )
}
