import Link from 'next/link'

/**
 * A row of mutually exclusive choices that live in the URL, inside one border.
 *
 * The control the catalog indexes sort with and the gear pages order their
 * sample photos with, so a sort looks and behaves the same wherever it is.
 * Links, not buttons: the choice belongs in the address so it survives a
 * reload and can be shared.
 */
export default function SegmentedLinks({
  label,
  options,
  active,
  hrefFor,
  scroll = true,
}: {
  /** Names the group to assistive technology. */
  label: string
  options: readonly { value: string; label: string }[]
  active: string
  hrefFor: (value: string) => string
  /**
   * Off where the control sits partway down a page. Choosing an order for the
   * photos below a film's description should not throw the reader back to
   * the top of the page to find them again.
   */
  scroll?: boolean
}) {
  return (
    <div className="inline-flex border border-neutral-800" role="group" aria-label={label}>
      {options.map(option => {
        const isActive = option.value === active
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            scroll={scroll}
            aria-current={isActive ? 'true' : undefined}
            className={`inline-flex h-8 items-center px-3 text-xs transition-colors ${
              isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}
