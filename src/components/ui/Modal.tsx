'use client'

import { useEffect, useId, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

/**
 * An overlay dialog, with the behaviour a dialog has to have.
 *
 * Every modal on the site had grown its own version of this, and each one was
 * missing something different: the likes list and the followers list could
 * only be dismissed with a pointer, neither moved focus, and the page behind
 * them scrolled while they were open. Getting it right once and reusing it is
 * the only way the fifth dialog is also right.
 *
 * What this handles: the backdrop and the click-outside, Escape, locking the
 * page behind, moving focus in on open and returning it to whatever opened it
 * on close, the dialog roles, and a labelled close button. Keeping Tab inside
 * is deliberately not attempted here — a correct focus trap is more than a
 * querySelector over `button, [href]`, and a half-trap that misses a control
 * is worse than none. Escape and the returned focus are what actually make
 * these usable.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  /** Width of the panel. Lists are narrow; forms are wider. */
  size = 'sm',
}: {
  open: boolean
  onClose: () => void
  /** Shown as the heading and used as the dialog's accessible name. */
  title: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    // Remembered before focus moves, so it can be handed back on close.
    openerRef.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      // Back to the control that opened this, so closing a dialog does not
      // drop a keyboard user at the top of the document.
      openerRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }[size]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${width} border border-neutral-800 bg-neutral-900 shadow-xl`}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 id={titleId} className="text-sm font-bold text-white">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 transition-colors hover:text-white
                       focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
                       focus-visible:outline-[#D32F2F]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * A person in one of the list dialogs — who liked a photo, who follows whom.
 * The two were separate copies of the same row, differing only in the alt text
 * one of them put on a decorative avatar.
 */
export function UserRow({
  user,
  onNavigate,
}: {
  user: { username: string; name: string | null; avatar: string | null }
  onNavigate: () => void
}) {
  return (
    <Link
      href={`/${user.username}`}
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-800
                 focus-visible:bg-neutral-800 focus-visible:outline-none"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-neutral-700 text-sm font-bold">
        {user.avatar ? (
          // Decorative: the name it belongs to is right beside it, so a screen
          // reader announcing the avatar as well would read the name twice.
          <Image src={user.avatar} alt="" width={36} height={36} className="h-full w-full object-cover" />
        ) : (
          (user.name || user.username).charAt(0).toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{user.name || user.username}</p>
        <p className="truncate text-xs text-neutral-500">@{user.username}</p>
      </div>
    </Link>
  )
}
