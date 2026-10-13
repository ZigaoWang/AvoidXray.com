import Link from 'next/link'
import { sectionHeadingClass } from './ui/PageHeader'

/**
 * A titled row of links to related gear, each with how many photos it has:
 * the cameras a film was shot with, the films a camera used, and the other
 * pairings on a pairing page.
 *
 * Three pages wrote this by hand, one with a smaller heading than the others.
 */
export default function GearLinks({
  heading,
  items,
}: {
  heading: string
  items: { href: string; label: string; count: number }[]
}) {
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <h2 className={`${sectionHeadingClass} mb-4`}>{heading}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-brand hover:text-white"
          >
            {item.label} <span className="text-neutral-500">({item.count.toLocaleString('en-US')})</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
