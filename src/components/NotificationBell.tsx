'use client'

import { useDismiss } from '@/components/ui/useDismiss'
import { useState, useId, useRef } from 'react'
import Link from 'next/link'
import { focusRing, focusRingInset } from '@/components/ui/focus'
import NotificationItem from '@/components/NotificationItem'
import { useNotificationFeed } from '@/components/useNotificationFeed'

export default function NotificationBell({ shownWhen }: { shownWhen: string }) {
  const { signedIn, notifications, setNotifications, unreadCount, setUnreadCount, more } = useNotificationFeed(shownWhen)
  const [open, setOpen] = useState(false)
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set())
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useDismiss(open, () => setOpen(false), [ref], triggerRef)

  const handleOpen = async () => {
    const next = !open
    setOpen(next)
    // What was new when the panel opened stays marked as new while it is open.
    // Marking them read on the server is right, but redrawing them as read in
    // the same instant erased which ones had brought the reader here.
    if (next) setFreshIds(new Set(notifications.filter(n => !n.read).map(n => n.id)))
    if (next && unreadCount > 0) {
      // Marking as read is a courtesy, not the point of opening the panel: if
      // it fails, the list still shows and the next poll will correct the
      // badge. It previously threw out of the handler on a dropped
      // connection, leaving the badge cleared on screen but not on the server.
      try {
        const res = await fetch('/api/notifications', { method: 'PATCH' })
        if (!res.ok) return
        setUnreadCount(0)
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      } catch {
        // Left unread; the next poll re-reports it.
      }
    }
  }

  if (!signedIn) return null

  return (
    <div
      ref={ref}
      // Positioned only from md up, so that below it the panel anchors to the
      // header instead of to the bell and can run the full width of it — the
      // same thing the mobile menu does from the button beside this one.
      className="md:relative"
      // Tab is how you move between notifications, so this cannot close on Tab
      // the way the account menu does. It closes once focus leaves the bell and
      // the panel together, which otherwise left the panel sitting open over
      // the page with the cursor already somewhere behind it, and Escape
      // pulling focus back to a bell nobody was on.
      onBlur={e => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        // Not a menu. The panel is a scrollable list of links to photos and
        // profiles rather than a list of commands, and aria-haspopup="menu"
        // promised a screen reader arrow key navigation and menu items that a
        // feed of notifications has no business implementing. aria-expanded
        // with aria-controls describes what this actually is.
        aria-expanded={open}
        aria-controls={panelId}
        // The badge is the only thing that distinguished this button, and a
        // screen reader was told neither that it was a bell nor that anything
        // was waiting behind it.
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        // 44px on a touch screen, where this is one of only two controls in
        // the header. p-1 around a 20px icon is a 28px target, which is below
        // what a thumb reliably hits — and the neighbouring menu button was
        // half again as large, so the two did not even miss consistently.
        className={`relative grid h-11 w-11 place-items-center text-neutral-400 transition-colors
                    hover:text-white ${focusRing}
                    [@media(hover:hover)]:h-8 [@media(hover:hover)]:w-8`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full
                       bg-brand text-[10px] font-bold text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          // Flush and full width under the header on a phone, a 320px dropdown
          // from md up. The bell sits 64px in from the right edge of the
          // viewport, so a fixed 320px panel hanging off it needed 384px of
          // viewport to fit: on a 375px screen the left end of every row was
          // off the side of the page, and nothing scrolls left to reach it.
          className="absolute left-0 right-0 top-full z-50 animate-slide-down border-y border-neutral-800
                     bg-neutral-900 shadow-xl md:left-auto md:mt-2 md:w-80 md:border"
        >
          <div className="border-b border-neutral-800 px-4 py-3">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
          </div>
          {/* 20rem is the height this has always had; the dvh cap is for the
              short viewport — a phone held sideways is about 375px tall, where
              320px of list plus the heading ran off the bottom of the screen
              with no way to scroll the page to it. overscroll-contain keeps a
              flick at the end of the list from scrolling the page behind. */}
          <div className="max-h-[min(20rem,60dvh)] overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                No notifications yet
              </div>
            ) : (
              // A list, and announced as one, so a reader is told how many
              // notifications there are and where each row ends. That is the
              // structure the menu roles were standing in for.
              <ul>
                {notifications.map(n => (
                  <li key={n.id}>
                    <NotificationItem n={n} fresh={!n.read || freshIds.has(n.id)} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* The bell holds the latest twenty; the page holds the rest. */}
          {more && (
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className={`block border-t border-neutral-800 px-4 py-3 text-center text-sm text-neutral-300
                          transition-colors hover:bg-neutral-800 hover:text-white ${focusRingInset}`}
            >
              See all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
