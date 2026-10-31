'use client'

import Link from 'next/link'
import Image from 'next/image'
import UserMenu from './UserMenu'
import NotificationBell from './NotificationBell'
import SearchButton from './SearchButton'
import MobileMenu from './MobileMenu'
import NavLinks from './NavLinks'
import TabBar from './TabBar'
import { ButtonLink } from '@/components/ui/Button'
import { focusRing } from '@/components/ui/focus'
import { loginHref } from '@/lib/loginHref'
import { usePathname } from 'next/navigation'

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
  /** The account has the library, which is its home and its first link. */
  library?: boolean
}

export default function HeaderBar({ user }: { user?: HeaderUser }) {
  const pathname = usePathname()
  const signedIn = Boolean(user?.username)
  const library = signedIn && user?.library === true

  return (
    // Sticky: the grids here scroll a long way, and a header that scrolls away
    // means getting anywhere else starts with scrolling back to the top.
    //
    // Opaque, not translucent. A backdrop blur only samples what is behind its
    // own box, so this and the profile tab bar stacked beneath it blurred
    // different photographs and met at a visible step, however closely their
    // backgrounds were matched.
    // pt for the status bar: with viewport-fit=cover the document starts
    // underneath it, so without this the logo sits behind the clock.
    <>
      <header className="sticky top-0 z-40 bg-[#0a0a0a] pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 h-16">
          <Link href={library ? '/library' : '/'} className="flex-shrink-0" aria-label="AvoidXray home">
            <Image src="/logo.svg" alt="AvoidXray" width={160} height={32} priority />
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <SearchButton variant="text" />
            <NavLinks library={library} />
            {signedIn && user?.username ? (
              <>
                <ButtonLink href="/upload" size="sm">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                  Upload
                </ButtonLink>
                {/* Tailwind's md, which shows this nav. */}
                <NotificationBell shownWhen="(min-width: 48rem)" />
                <UserMenu
                  username={user.username}
                  name={user.name ?? undefined}
                  avatar={user.avatar ?? undefined}
                  library={library}
                />
              </>
            ) : (
              <>
                <Link
                  href={loginHref(pathname)}
                  className={`py-2 text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium ${focusRing}`}
                >
                  Sign in
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
            <SearchButton variant="icon" />
            {/* With the tab bar, notifications are its Activity tab. */}
            {signedIn && !library && <NotificationBell shownWhen="not all and (min-width: 48rem)" />}
            <MobileMenu
              isLoggedIn={signedIn}
              username={user?.username}
              name={user?.name}
              avatar={user?.avatar}
              library={library}
            />
          </div>
        </div>
      </header>
      {/* Beside the header, not in it: the sticky header is its own stacking
          layer, and from inside it the tab bar would sit above the selection
          bar that is meant to cover it. */}
      {library && user?.username && <TabBar username={user.username} name={user.name} avatar={user.avatar} />}
    </>
  )
}
