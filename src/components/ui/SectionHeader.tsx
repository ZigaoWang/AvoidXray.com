import Link from 'next/link'
import { focusRing } from './focus'
import { sectionHeadingClass } from './PageHeader'

/**
 * A section's heading with, opposite it, the link to the rest: "Latest
 * frames · See all", "More like this · More on Portra 400".
 *
 * Written out on the home page, the photo page and search, in two link
 * styles (grey to red, and lighter grey to white) and with or without an
 * arrow.
 */
export default function SectionHeader({ title, link, className = 'mb-6' }: {
  title: React.ReactNode
  link?: { href: string; label: string }
  className?: string
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <h2 className={sectionHeadingClass}>{title}</h2>
      {link && (
        <Link href={link.href} className={`shrink-0 text-sm text-neutral-500 transition-colors hover:text-brand ${focusRing}`}>
          {link.label} &rarr;
        </Link>
      )}
    </div>
  )
}
