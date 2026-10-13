import { Fragment } from 'react'
import Link from 'next/link'

/**
 * Where a page sits, as links back up the trail, ending on the page itself.
 *
 * Four pages each wrote their own. Two did not wrap, so a long film or camera
 * name ran off the side of a phone, and one sat further from its heading than
 * the rest.
 */
export default function Breadcrumb({
  trail,
  current,
}: {
  trail: { href: string; label: string }[]
  current: string
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-neutral-500">
        {trail.map(step => (
          <Fragment key={step.href}>
            <li><Link href={step.href} className="hover:text-white">{step.label}</Link></li>
            <li aria-hidden>/</li>
          </Fragment>
        ))}
        <li aria-current="page" className="min-w-0 text-neutral-300">{current}</li>
      </ol>
    </nav>
  )
}
