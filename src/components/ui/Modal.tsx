'use client'

import { useId, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useDialogBehavior } from './dialog'
import { focusRingInset } from './focus'
import { iconButtonClass } from './Button'

/**
 * An overlay dialog, with the behavior a dialog has to have.
 *
 * Every modal on the site had grown its own version of this, and each one was
 * missing something different: the likes list and the followers list could
 * only be dismissed with a pointer, neither moved focus, and the page behind
 * them scrolled while they were open. Getting it right once and reusing it is
 * the only way the fifth dialog is also right.
 *
 * What this handles: the backdrop and the click-outside, Escape, locking the
 * page behind, moving focus in on open and returning it to whatever opened it
 * on close, the dialog roles, a labeled close button, and keeping the panel
 * inside the viewport. That last one is a phone bug: the panel had no ceiling,
 * so a dialog taller than the screen pushed its own footer past the bottom
 * edge, and because opening a dialog locks the page behind it there was then
 * no way to scroll to the button you came for. Keeping Tab inside
 * is deliberately not attempted here — a correct focus trap is more than a
 * querySelector over `button, [href]`, and a half-trap that misses a control
 * is worse than none. Escape and the returned focus are what actually make
 * these usable.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  /** Width of the panel. Lists are narrow; forms are wider. */
  size = 'sm',
  busy = false,
  initialFocus,
}: {
  open: boolean
  onClose: () => void
  /** Shown as the heading and used as the dialog's accessible name. */
  title: React.ReactNode
  /** A second line under the heading: what is being edited, or who sent it. */
  description?: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /**
   * Something the dialog started is still running, or a confirmation sits on
   * top of it. Every way out is held shut — the close button, Escape and the
   * backdrop — because this dialog is the only thing reporting that state, and
   * dismissing it would either hide a request in flight or throw away the form
   * the confirmation is asking about.
   */
  busy?: boolean
  /** Focused on open. Defaults to the close button. */
  initialFocus?: React.RefObject<HTMLElement | null>
}) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  // One gate for all three dismissals, so a dialog cannot be Escaped out of
  // while its own button refuses to close it.
  const requestClose = () => { if (!busy) onClose() }
  const panelRef = useDialogBehavior({
    open,
    onClose: requestClose,
    initialFocus: initialFocus ?? closeRef,
  })

  if (!open) return null

  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' }[size]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // dvh, because the ceiling has to follow the mobile browser's chrome as
        // it comes and goes; 2rem is the overlay's own padding.
        className={`flex max-h-[calc(100dvh-2rem)] w-full ${width} flex-col border border-neutral-800
                   bg-neutral-900 shadow-xl focus:outline-none`}
        onClick={event => event.stopPropagation()}
      >
        <div
          className={`flex shrink-0 justify-between gap-3 border-b border-neutral-800 px-4 py-3
                     ${description ? 'items-start' : 'items-center'}`}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-bold text-white">
              {title}
            </h2>
            {description && (
              <div className="mt-0.5 text-xs text-neutral-500">{description}</div>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
            className={`${iconButtonClass} -mr-3 shrink-0`}
          >
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* The heading and Close stay put above this, so whatever a dialog puts
            at its own foot is always one scroll away rather than off-screen.
            Contained, so reaching the end of a list does not hand the gesture
            to the locked page behind. */}
        <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain">{children}</div>
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
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-800
                 focus-visible:bg-neutral-800 ${focusRingInset}`}
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
