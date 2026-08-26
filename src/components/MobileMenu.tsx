'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV, isCurrentSection } from '@/lib/nav'

interface MobileMenuProps {
  isLoggedIn: boolean
  username?: string
}

export default function MobileMenu({ isLoggedIn, username }: MobileMenuProps) {
  const pathname = usePathname() ?? ''
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Holds the path the menu was opened on, rather than a plain boolean. The
  // menu is then open only while the viewer is still on that page, so any
  // navigation closes it — including the browser's back button and a tap on
  // the link for the page you are already on, neither of which runs a link's
  // onClick. Derived this way there is no effect to keep in sync.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname

  const close = () => setOpenAt(null)

  // Escape closes it, and the page behind stays put while it is open.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpenAt(null)
      buttonRef.current?.focus()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const rowClass = (current: boolean) =>
    `py-3 pl-3 text-base transition-colors border-l-2 ${
      current ? 'text-white border-[#D32F2F]' : 'text-neutral-400 border-transparent hover:text-white'
    }`

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        onClick={() => setOpenAt(open ? null : pathname)}
        className="relative z-50 text-neutral-400 hover:text-white p-2 -mr-2"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <>
          {/* Tapping away closes it, which is the gesture people already try.
              Previously only the button itself would. */}
          <button
            className="fixed inset-0 z-40 bg-black/60 cursor-default"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
          />

          <div
            id="mobile-menu"
            className="absolute top-full left-0 right-0 z-50 bg-[#0a0a0a] border-t border-neutral-800
                       max-h-[80dvh] overflow-y-auto overscroll-contain
                       pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <nav className="flex flex-col p-4">
              {/* Search was desktop-only, so on a phone there was no way to
                  look anything up at all. */}
              <Link
                href="/search"
                onClick={close}
                className="flex items-center gap-3 mb-4 px-3 py-3 bg-neutral-900 border border-neutral-800
                           text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <span className="text-sm">Search photos, people, gear</span>
              </Link>

              {PRIMARY_NAV.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  aria-current={isCurrentSection(pathname, item.href) ? 'page' : undefined}
                  className={rowClass(isCurrentSection(pathname, item.href))}
                >
                  {item.label}
                </Link>
              ))}

              <div className="h-px bg-neutral-800 my-3" />

              {isLoggedIn && username ? (
                <>
                  <Link href={`/${username}`} onClick={close} className={rowClass(pathname === `/${username}`)}>
                    Profile
                  </Link>
                  <Link href="/albums" onClick={close} className={rowClass(isCurrentSection(pathname, '/albums'))}>
                    My Albums
                  </Link>
                  <Link href="/settings" onClick={close} className={rowClass(pathname === '/settings')}>
                    Settings
                  </Link>
                  <Link
                    href="/upload"
                    onClick={close}
                    className="mt-4 bg-[#D32F2F] hover:bg-[#b71c1c] text-white text-center py-3 font-bold transition-colors"
                  >
                    Upload
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={close} className={rowClass(pathname === '/login')}>
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    onClick={close}
                    className="mt-4 bg-[#D32F2F] hover:bg-[#b71c1c] text-white text-center py-3 font-bold transition-colors"
                  >
                    Join
                  </Link>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </div>
  )
}
