'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { formatDate } from '@/lib/formatDate'

interface Notification {
  id: string
  type: 'like' | 'comment' | 'follow'
  read: boolean
  createdAt: string
  actor: { username: string; name: string | null; avatar: string | null } | null
  photo: { id: string; thumbnailPath: string } | null
}

/**
 * How often a visible tab checks for new notifications.
 *
 * Was 30 seconds, which produced roughly 1,900 requests a day against a
 * handful of active accounts — four database queries each. A like or a comment
 * is not time-critical, and the poll now pauses entirely while the tab is
 * hidden, so this can be considerably less eager without anyone noticing.
 */
const POLL_INTERVAL_MS = 120_000

export default function NotificationBell() {
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!session) return

    const controller = new AbortController()

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      } catch {
        // A failed poll is not worth reporting; the next one will catch up.
      }
    }

    let timer: ReturnType<typeof setInterval> | undefined

    const startPolling = () => {
      if (timer) return
      timer = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    }

    const stopPolling = () => {
      clearInterval(timer)
      timer = undefined
    }

    // Polling ran unconditionally every 30s for every open tab, which made
    // this endpoint the busiest thing on the site by a wide margin — most of
    // it for tabs sitting in the background with nobody looking. A hidden tab
    // now stops entirely and catches up in one request when it comes back.
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        fetchNotifications()
        startPolling()
      }
    }

    fetchNotifications()
    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      controller.abort()
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [session])

  useEffect(() => {
    if (!open) return

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Escape closed nothing here, so the panel could only be dismissed with a
    // pointer.
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

  const handleOpen = async () => {
    const next = !open
    setOpen(next)
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

  if (!session) return null

  const getMessage = (n: Notification) => {
    switch (n.type) {
      case 'like': return 'liked your photo'
      case 'comment': return 'commented on your photo'
      case 'follow': return 'started following you'
      default: return ''
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        // The badge is the only thing that distinguished this button, and a
        // screen reader was told neither that it was a bell nor that anything
        // was waiting behind it.
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        className="relative p-1 text-neutral-400 transition-colors hover:text-white
                   focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
                   focus-visible:outline-[#D32F2F]"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full
                       bg-[#D32F2F] text-[10px] font-bold text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 animate-slide-down border border-neutral-800 bg-neutral-900 shadow-xl">
          <div className="border-b border-neutral-800 px-4 py-3">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
          </div>
          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                No notifications yet
              </div>
            ) : (
            notifications.filter(n => n.actor).map(n => (
                /*
                  One link per row, and nothing clickable inside it.

                  The avatar and the name were spans carrying their own onClick
                  and pushing to the actor's profile. A span is not focusable
                  and not operable by Enter, so those two targets did not exist
                  for anyone using a keyboard — and nesting them inside an <a>
                  is markup a browser is free to reparent, which is how the
                  same row ends up behaving differently in different browsers.

                  The row goes to the thing the notification is about, which is
                  what someone opening a notification is asking for. The actor's
                  profile is one tap further on, from the photo or from the
                  follow itself.
                */
                <Link
                  key={n.id}
                  href={n.photo ? `/photos/${n.photo.id}` : `/${n.actor!.username}`}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-800
                              focus-visible:bg-neutral-800 focus-visible:outline-none
                              ${!n.read ? 'bg-neutral-800/50' : ''}`}
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden bg-neutral-800 text-xs font-bold">
                    {n.actor!.avatar ? (
                      <Image src={n.actor!.avatar} alt="" width={32} height={32} className="h-full w-full object-cover" />
                    ) : (
                      (n.actor!.name || n.actor!.username).charAt(0).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      <span className="font-medium">{n.actor!.name || n.actor!.username}</span>{' '}
                      <span className="text-neutral-400">{getMessage(n)}</span>
                    </p>
                    <time dateTime={n.createdAt} className="text-xs text-neutral-600">
                      {formatDate(n.createdAt)}
                    </time>
                  </div>
                  {n.photo && (
                    <div className="h-10 w-10 flex-shrink-0">
                      <Image src={n.photo.thumbnailPath} alt="" aria-hidden width={40} height={40} className="h-full w-full object-cover" />
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
