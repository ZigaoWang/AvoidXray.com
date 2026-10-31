'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { PRIMARY_NAV, isCurrentSection } from '@/lib/nav'
import { ButtonLink } from '@/components/ui/Button'
import { focusRing } from '@/components/ui/focus'
import { useDialogBehavior } from '@/components/ui/dialog'
import { loginHref } from '@/lib/loginHref'
import Avatar from '@/components/ui/Avatar'
import { eyebrowClass } from '@/components/ui/PageHeader'

interface MobileMenuProps {
  isLoggedIn: boolean
  username?: string
  name?: string | null
  avatar?: string | null
  /** The account has the library: it replaces Your photos, and Upload is in the tab bar. */
  library?: boolean
}

export default function MobileMenu({ isLoggedIn, username, name, avatar, library = false }: MobileMenuProps) {
  const pathname = usePathname() ?? ''

  // Holds the path the menu was opened on, rather than a plain boolean. The
  // menu is then open only while the viewer is still on that page, so any
  // navigation closes it — including the browser's back button and a tap on
  // the link for the page you are already on, neither of which runs a link's
  // onClick. Derived this way there is no effect to keep in sync.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname

  const close = () => setOpenAt(null)

  // The shared dialog behavior: Escape closes, the page behind does not
  // scroll, focus moves into the menu and back to the button, and Tab stays
  // inside. It is applied to the wrapper rather than the panel so the button,
  // which is also how the menu closes, stays in the Tab loop. Before this, Tab
  // walked out into the page hidden under the overlay.
  const menuRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useDialogBehavior({ open, onClose: close, initialFocus: menuRef })

  // The menu is hidden by CSS from md up, but the scroll lock is not. A tablet
  // rotated to landscape with the menu open hid it and left the page unable to
  // scroll. Tailwind's md is 48rem.
  useEffect(() => {
    if (!open) return
    const wide = window.matchMedia('(min-width: 48rem)')
    const onWide = () => { if (wide.matches) setOpenAt(null) }
    wide.addEventListener('change', onWide)
    return () => wide.removeEventListener('change', onWide)
  }, [open])

  const rowClass = (current: boolean) =>
    `py-3 pl-3 text-base transition-colors border-l-2 ${
      current ? 'text-white border-brand' : 'text-neutral-400 border-transparent hover:text-white'
    }`

  return (
    <div ref={wrapperRef} className="md:hidden">
      <button
        onClick={() => setOpenAt(open ? null : pathname)}
        className={`relative z-50 -mr-2 grid h-11 w-11 place-items-center text-neutral-400
                    transition-colors hover:text-white ${focusRing}`}
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
            className="fixed inset-0 z-40 bg-black/80 cursor-default"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
          />

          <div
            ref={menuRef}
            id="mobile-menu"
            role="dialog"
            aria-label="Menu"
            tabIndex={-1}
            className="absolute top-full left-0 right-0 z-50 bg-[#0a0a0a] border-t border-neutral-800 focus:outline-none
                       max-h-[80dvh] overflow-y-auto overscroll-contain
                       pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <nav className="flex flex-col p-4">
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
                    <Avatar src={avatar} name={name || username || ''} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{name || username}</span>
                      <span className="block truncate text-xs text-neutral-500">@{username}</span>
                    </span>
                  </Link>

                  {library ? (
                    <Link href="/library" onClick={close} className={rowClass(isCurrentSection(pathname, '/library'))}>
                      Library
                    </Link>
                  ) : (
                    <Link href="/manage" onClick={close} className={rowClass(pathname === '/manage')}>
                      Your photos
                    </Link>
                  )}
                  <Link href="/albums" onClick={close} className={rowClass(isCurrentSection(pathname, '/albums'))}>
                    Your albums
                  </Link>
                  <Link href="/settings" onClick={close} className={rowClass(pathname === '/settings')}>
                    Settings
                  </Link>

                  {!library && (
                    <ButtonLink href="/upload" onClick={close} size="lg" fullWidth className="mt-4">
                      Upload
                    </ButtonLink>
                  )}

                  {/* Sign out lived only in the desktop account menu, which is
                      hidden below md — so on a phone there was no way to sign
                      out of this site at all. */}
                  <button
                    type="button"
                    onClick={() => { close(); signOut({ callbackUrl: '/' }) }}
                    className={`mt-4 py-3 pl-3 text-left text-base text-neutral-400 transition-colors
                                hover:text-brand ${focusRing}`}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href={loginHref(pathname)} onClick={close} className={rowClass(pathname === '/login')}>
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
              <div className="flex flex-wrap gap-x-5 gap-y-2 pl-3 text-xs text-neutral-500">
                <Link href="/guidelines" onClick={close} className="transition-colors hover:text-neutral-300">
                  Guidelines
                </Link>
                <Link href="/feedback" onClick={close} className="transition-colors hover:text-neutral-300">
                  Feedback
                </Link>
                <Link href="/legal" onClick={close} className="transition-colors hover:text-neutral-300">
                  Terms and privacy
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
    <p className={`mb-1 pl-3 ${eyebrowClass}`}>
      {children}
    </p>
  )
}
