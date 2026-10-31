'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LIBRARY_NAV, inLibrary, isCurrentSection, primaryNav } from '@/lib/nav'

/**
 * The primary links, with the current section marked.
 *
 * Nothing in the header used to indicate where you were, so on a site that is
 * mostly grids of photographs every page looked alike. `aria-current` carries
 * the same information to a screen reader as the underline does visually.
 */
export default function NavLinks({ library = false, onNavigate }: { library?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() ?? ''

  return (
    <>
      {primaryNav(library).map(item => {
        const current = item === LIBRARY_NAV ? inLibrary(pathname) : isCurrentSection(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={current ? 'page' : undefined}
            className={`relative text-xs uppercase tracking-wide font-medium transition-colors
              ${current ? 'text-white' : 'text-neutral-400 hover:text-white'}
              after:absolute after:left-0 after:right-0 after:-bottom-1.5 after:h-px after:transition-colors
              ${current ? 'after:bg-brand' : 'after:bg-transparent'}`}
          >
            {item.label}
          </Link>
        )
      })}
    </>
  )
}
