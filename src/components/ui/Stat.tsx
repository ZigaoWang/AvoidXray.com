import Link from 'next/link'
import { focusRing } from './focus'
import { eyebrowClass } from './PageHeader'

/**
 * A number and what it counts, in a panel: a profile's stats, the admin
 * overview, analytics, the moderation queue.
 *
 * There were four looks for this: 24px and 30px figures, the label above or
 * below in three greys, panels on neutral-900 and neutral-950 or none.
 */
export default function Stat({ label, value, href, children }: {
  label: string
  value: number | string
  /** Where the number leads, when there is a page of what it counts. */
  href?: string
  /** A line under the label: a change against last week, a note. */
  children?: React.ReactNode
}) {
  const body = (
    <>
      <div className="text-2xl font-black tracking-tight text-white tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </div>
      <div className={`mt-1 ${eyebrowClass}`}>{label}</div>
      {children && <div className="mt-1 text-xs text-neutral-500">{children}</div>}
    </>
  )
  const panel = 'block border border-neutral-800 bg-neutral-900 p-4'
  return href
    ? <Link href={href} className={`${panel} transition-colors hover:border-neutral-600 ${focusRing}`}>{body}</Link>
    : <div className={panel}>{body}</div>
}
