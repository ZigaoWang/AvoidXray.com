'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV, isCurrentSection } from '@/lib/nav'
import LinkPending from '@/components/LinkPending'

/**
 * The primary links, with the current section marked.
 *
 * Nothing in the header used to indicate where you were, so on a site that is
 * mostly grids of photographs every page looked alike. `aria-current` carries
 * the same information to a screen reader as the underline does visually.
 */
export default function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? ''

  return (
    <>
      {PRIMARY_NAV.map(item => {
        const current = isCurrentSection(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={current ? 'page' : undefined}
            className={`relative text-xs uppercase tracking-wide font-medium transition-colors
              ${current ? 'text-white' : 'text-neutral-400 hover:text-white'}
              after:absolute after:left-0 after:right-0 after:-bottom-1.5 after:h-px after:transition-colors
              ${current ? 'after:bg-[#D32F2F]' : 'after:bg-transparent'}`}
          >
            {item.label}
            {/* Sits exactly where the current-section rule sits, so a click
                reads as the underline moving to where you are going. */}
            <LinkPending className="absolute left-0 right-0 -bottom-1.5 h-px bg-[#D32F2F]" />
          </Link>
        )
      })}
    </>
  )
}
