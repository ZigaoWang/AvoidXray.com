'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import { focusRingInset } from '@/components/ui/focus'
import { inLibrary, isCurrentSection } from '@/lib/nav'
import { useNotificationFeed } from '@/components/useNotificationFeed'

/** Tailwind's md: the tab bar is for phones, where the header nav is hidden. */
const PHONE = 'not all and (min-width: 48rem)'

const ICON = 'h-6 w-6'

/**
 * The bottom tab bar on a phone, for accounts with the library: Library,
 * Explore, Upload, Activity and You, each one tap away as in a native app.
 *
 * Fixed under everything else at the bottom: a selection bar, which is a mode
 * of the page, covers it while there is a selection, and dialogs cover both.
 * globals.css pads the page by its height while it is in the document, so the
 * footer and the last row of photos are never under it.
 */
export default function TabBar({ username, name, avatar }: { username: string; name?: string | null; avatar?: string | null }) {
  const pathname = usePathname() ?? ''
  const { unreadCount } = useNotificationFeed(PHONE)

  const tabs = [
    {
      href: '/library', label: 'Library', current: inLibrary(pathname),
      icon: (
        <svg className={ICON} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      ),
    },
    {
      href: '/explore', label: 'Explore', current: isCurrentSection(pathname, '/explore'),
      icon: (
        <svg className={ICON} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="9" strokeWidth={1.75} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
        </svg>
      ),
    },
    {
      href: '/upload', label: 'Upload', current: isCurrentSection(pathname, '/upload'), primary: true,
      icon: (
        <span className="grid h-6 w-9 place-items-center bg-brand text-white">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </span>
      ),
    },
    {
      href: '/notifications', label: 'Activity', current: isCurrentSection(pathname, '/notifications'),
      badge: unreadCount,
      icon: (
        <svg className={ICON} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      href: `/${username}`, label: 'You', current: isCurrentSection(pathname, `/${username}`),
      icon: <Avatar src={avatar} name={name || username} size={24} />,
    },
  ]

  return (
    <nav
      aria-label="Main"
      data-tab-bar
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-[#0a0a0a] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-14 grid-cols-5">
        {tabs.map(tab => (
          <li key={tab.href} className="min-w-0">
            <Link
              href={tab.href}
              aria-current={tab.current ? 'page' : undefined}
              aria-label={tab.badge ? `${tab.label}, ${tab.badge} unread` : undefined}
              className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium uppercase
                          tracking-wide transition-colors ${focusRingInset}
                          ${tab.current ? 'text-white' : 'text-neutral-400 hover:text-white'}
                          ${tab.current && !tab.primary ? 'before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-brand' : ''}`}
            >
              <span className={`relative ${tab.current && tab.href === `/${username}` ? 'ring-1 ring-white' : ''}`}>
                {tab.icon}
                {tab.badge ? (
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-0.5
                               text-[10px] font-bold text-white"
                  >
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                ) : null}
              </span>
              <span>{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
