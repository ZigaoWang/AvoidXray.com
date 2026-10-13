'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { focusRing, focusRingInset } from '@/components/ui/focus'
import Avatar from '@/components/ui/Avatar'

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
 * this is the same behavior on the one menu every signed-in reader uses on
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
    `focus:bg-neutral-800 focus:text-white ${focusRingInset}`

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name || username}`}
        className={`flex h-8 w-8 items-center justify-center overflow-hidden bg-neutral-800 text-sm font-bold
                    text-white transition-colors hover:bg-neutral-700 ${focusRing}`}
      >
        <Avatar src={avatar} name={name || username} size={32} className="bg-transparent" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-48 border border-neutral-800 bg-neutral-900 shadow-xl"
          // Tabbing out closes it rather than leaving an open panel hanging
          // over the page behind. Same rule as the overflow menu.
          //
          // The arrows, Home and End move between items, which is what a
          // screen reader announcing "menu" tells its user to press.
          onKeyDown={e => {
            if (e.key === 'Tab') { setOpen(false); return }
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
            const at = items.indexOf(document.activeElement as HTMLElement)
            const target =
              e.key === 'ArrowDown' ? items[(at + 1) % items.length]
              : e.key === 'ArrowUp' ? items[at <= 0 ? items.length - 1 : at - 1]
              : e.key === 'Home' ? items[0]
              : e.key === 'End' ? items[items.length - 1]
              : null
            if (!target) return
            e.preventDefault()
            target.focus()
          }}
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
              className={`block w-full px-4 py-2 text-left text-sm text-neutral-400 transition-colors
                         hover:bg-neutral-800 hover:text-brand
                         focus:bg-neutral-800 focus:text-brand ${focusRingInset}`}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
