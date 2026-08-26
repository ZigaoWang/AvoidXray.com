'use client'

import Link from 'next/link'
import Image from 'next/image'
import UserMenu from './UserMenu'
import SearchBar from './SearchBar'
import NotificationBell from './NotificationBell'
import MobileMenu from './MobileMenu'
import NavLinks from './NavLinks'
import { ButtonLink } from '@/components/ui/Button'

/**
 * The header, rendered once and shared.
 *
 * There were two near-identical copies of this markup — one server-rendered,
 * one client-rendered for the pages that need a session on the client — and
 * the nav links were written out a third time in the mobile menu. Anything
 * added to one had to be remembered in the others. Both wrappers now supply
 * only the session and render this.
 */
export interface HeaderUser {
  username?: string
  name?: string | null
  avatar?: string | null
}

export default function HeaderBar({ user }: { user?: HeaderUser }) {
  const signedIn = Boolean(user?.username)

  return (
    // Sticky: the grids here scroll a long way, and a header that scrolls away
    // means getting anywhere else starts with scrolling back to the top. The
    // translucent background keeps photographs visible underneath rather than
    // hiding a band of them behind a solid bar.
    <header className="sticky top-0 z-40 bg-[#0a0a0a]/85 backdrop-blur-md border-b border-neutral-900/80">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 h-16">
        <Link href="/" className="flex-shrink-0" aria-label="AvoidXray home">
          <Image src="/logo.svg" alt="AvoidXray" width={160} height={32} priority />
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <SearchBar />
          <NavLinks />
          {signedIn && user?.username ? (
            <>
              <ButtonLink href="/upload" size="sm">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                </svg>
                Upload
              </ButtonLink>
              <NotificationBell />
              <UserMenu
                username={user.username}
                name={user.name ?? undefined}
                avatar={user.avatar ?? undefined}
              />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium"
              >
                Sign In
              </Link>
              <ButtonLink href="/register" size="sm">
                Join
              </ButtonLink>
            </>
          )}
        </nav>

        {/* The bell sits in the bar rather than inside the menu, so an unread
            count is visible without opening anything. It previously rendered
            only in the desktop nav, which meant that on a phone there was no
            sign a notification had arrived at all. */}
        <div className="flex items-center gap-1 md:hidden">
          {signedIn && <NotificationBell />}
          <MobileMenu isLoggedIn={signedIn} username={user?.username} />
        </div>
      </div>
    </header>
  )
}
