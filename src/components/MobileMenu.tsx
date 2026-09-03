'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { signOut } from 'next-auth/react'
import { PRIMARY_NAV, isCurrentSection } from '@/lib/nav'
import { ButtonLink } from '@/components/ui/Button'

interface MobileMenuProps {
  isLoggedIn: boolean
  username?: string
  name?: string | null
  avatar?: string | null
}

export default function MobileMenu({ isLoggedIn, username, name, avatar }: MobileMenuProps) {
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
        className="relative z-50 -mr-2 grid h-11 w-11 place-items-center text-neutral-400
                   transition-colors hover:text-white focus-visible:outline focus-visible:outline-1
                   focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]"
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
                className="mb-5 flex items-center gap-3 border border-neutral-800 bg-neutral-900 px-3 py-3
                           text-neutral-400 transition-colors hover:text-white"
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <span className="text-sm">Search photos, people, gear</span>
              </Link>

              {/* Headed sections. This was one undifferentiated column of nine
                  links, so "Cameras" — a place on the site — sat in the same
                  list as "Settings", which is yours. */}
              <SectionLabel>Browse</SectionLabel>
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

              <div className="my-4 h-px bg-neutral-800" />

              {isLoggedIn && username ? (
                <>
                  {/* Which account you are on. The menu never said, so on a
                      shared phone the only way to find out was to open your
                      profile. */}
                  <Link
                    href={`/${username}`}
                    onClick={close}
                    className="mb-2 flex items-center gap-3 py-2 transition-opacity hover:opacity-80"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-neutral-800 text-sm font-bold text-white">
                      {avatar ? (
                        <Image src={avatar} alt="" width={40} height={40} className="h-full w-full object-cover" />
                      ) : (
                        (name || username).charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{name || username}</span>
                      <span className="block truncate text-xs text-neutral-500">@{username}</span>
                    </span>
                  </Link>

                  <Link href="/manage" onClick={close} className={rowClass(pathname === '/manage')}>
                    Your photos
                  </Link>
                  <Link href="/albums" onClick={close} className={rowClass(isCurrentSection(pathname, '/albums'))}>
                    Your albums
                  </Link>
                  <Link href="/settings" onClick={close} className={rowClass(pathname === '/settings')}>
                    Settings
                  </Link>

                  <ButtonLink href="/upload" onClick={close} size="lg" fullWidth className="mt-4">
                    Upload
                  </ButtonLink>

                  {/* Sign out lived only in the desktop account menu, which is
                      hidden below md — so on a phone there was no way to sign
                      out of this site at all. */}
                  <button
                    type="button"
                    onClick={() => { close(); signOut({ callbackUrl: '/' }) }}
                    className="mt-4 py-3 pl-3 text-left text-base text-neutral-400 transition-colors
                               hover:text-[#D32F2F] focus-visible:outline focus-visible:outline-1
                               focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={close} className={rowClass(pathname === '/login')}>
                    Sign in
                  </Link>
                  <ButtonLink href="/register" onClick={close} size="lg" fullWidth className="mt-4">
                    Join
                  </ButtonLink>
                </>
              )}

              {/* The same secondary links the footer carries, so the menu is a
                  complete map of the site rather than most of one. */}
              <div className="my-4 h-px bg-neutral-800" />
              <div className="flex flex-wrap gap-x-5 gap-y-2 pl-3 text-xs text-neutral-600">
                <Link href="/guidelines" onClick={close} className="transition-colors hover:text-neutral-300">
                  Guidelines
                </Link>
                <Link href="/feedback" onClick={close} className="transition-colors hover:text-neutral-300">
                  Feedback
                </Link>
                <Link href="/legal" onClick={close} className="transition-colors hover:text-neutral-300">
                  Terms &amp; privacy
                </Link>
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  )
}

/** A quiet heading over a group of links in the menu. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 pl-3 text-[10px] font-medium uppercase tracking-widest text-neutral-600">
      {children}
    </p>
  )
}
