'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from 'next-auth/react'

type UserMenuProps = {
  username: string
  name?: string | null
  avatar?: string | null
}

const ITEMS = [
  { href: '/manage', label: 'Your photos' },
  { href: '/albums', label: 'Your albums' },
  { href: '/settings', label: 'Settings' },
] as const

/**
 * The account menu in the header.
 *
 * It was a bare avatar button with no accessible name, no indication that it
 * opened anything, no way to close it except a click elsewhere, and no return
 * of focus — so opening it by keyboard left you tabbing into a panel with no
 * way out but Tab, and a screen reader announced it only as "button".
 *
 * The overflow menu on photos and comments already does all of this properly;
 * this is the same behaviour on the one menu every signed-in reader uses on
 * every page.
 */
export default function UserMenu({ username, name, avatar }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // Focus moves into the panel on open, so the first thing after pressing
  // Enter on the avatar is the first item rather than the page behind it.
  useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

  const itemClass =
    'block px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white ' +
    'focus:bg-neutral-800 focus:text-white focus:outline-none'

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name || username}`}
        className="flex h-8 w-8 items-center justify-center overflow-hidden bg-neutral-800 text-sm font-bold
                   text-white transition-colors hover:bg-neutral-700
                   focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
                   focus-visible:outline-[#D32F2F]"
      >
        {avatar ? (
          <Image src={avatar} alt="" width={32} height={32} className="h-full w-full object-cover" />
        ) : (
          (name || username).charAt(0).toUpperCase()
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-48 border border-neutral-800 bg-neutral-900 shadow-xl"
          // Tabbing out closes it rather than leaving an open panel hanging
          // over the page behind. Same rule as the overflow menu.
          onKeyDown={e => { if (e.key === 'Tab') setOpen(false) }}
        >
          <div className="border-b border-neutral-800 px-4 py-3">
            <p className="truncate text-sm font-medium text-white">{name || username}</p>
            <p className="truncate text-xs text-neutral-500">@{username}</p>
          </div>
          <div className="py-1">
            <Link
              ref={firstItemRef}
              href={`/${username}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              Profile
            </Link>
            {ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-neutral-800 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: '/' })}
              className="block w-full px-4 py-2 text-left text-sm text-neutral-400 transition-colors
                         hover:bg-neutral-800 hover:text-[#D32F2F]
                         focus:bg-neutral-800 focus:text-[#D32F2F] focus:outline-none"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
