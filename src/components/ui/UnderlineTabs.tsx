import Link from 'next/link'
import { focusRingInset } from './focus'

/**
 * The look of one tab in a row of underlined tabs, for the rows built from
 * buttons rather than links.
 *
 * Every inactive tab carries a transparent border so the row does not shift
 * by 2px when the selection moves, and the padding gives a short label such
 * as "All" a target wider than its letters.
 */
export function underlineTabClass(current: boolean) {
  return `block whitespace-nowrap border-b-2 px-2 py-3 text-sm font-medium transition-colors ${focusRingInset} ${
    current ? 'border-brand text-white' : 'border-transparent text-neutral-500 hover:text-white'
  }`
}

/**
 * A row of underlined tabs that are links: Explore's feeds, search result
 * types, and the Photos and Albums halves of Your work.
 *
 * Each page had its own copy, and they had drifted: different gaps and
 * padding, a 2px jump on two of them, and no aria-current on those two.
 */
export default function UnderlineTabs({
  label,
  tabs,
  trailing,
}: {
  label: string
  tabs: { href: string; label: string; current: boolean }[]
  /** Something to sit at the far end of the row, such as a create button. */
  trailing?: React.ReactNode
}) {
  return (
    <nav aria-label={label} className="mb-8 flex items-center gap-4 border-b border-neutral-800">
      {/* Pulled left by the tab padding, so the first label lines up with the
          page heading above it. */}
      <div className="-ml-2 flex min-w-0 gap-2 overflow-x-auto">
        {tabs.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? 'page' : undefined}
            className={underlineTabClass(tab.current)}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {trailing && <div className="ml-auto shrink-0">{trailing}</div>}
    </nav>
  )
}
