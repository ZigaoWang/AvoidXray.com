'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useSession } from 'next-auth/react'
import type { NotificationItemData } from '@/components/NotificationItem'

export type Notification = NotificationItemData & { read: boolean; createdAt: string }

/**
 * How often a visible tab checks for new notifications.
 *
 * Was 30 seconds, which produced roughly 1,900 requests a day against a
 * handful of active accounts — four database queries each. A like or a comment
 * is not time-critical, and the poll now pauses entirely while the tab is
 * hidden, so this can be considerably less eager without anyone noticing.
 */
const POLL_INTERVAL_MS = 120_000

/**
 * The header renders a bell in the desktop nav and another in the phone bar,
 * and CSS hides one of them. Both polled, which doubled the requests the
 * interval above was set to cut. Each now polls only while its media query,
 * the breakpoint it is shown at, matches.
 */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/**
 * The signed-in reader's latest notifications, polled while `shownWhen`
 * matches: the bell's list and the phone tab bar's unread count.
 */
export function useNotificationFeed(shownWhen: string) {
  const { data: session } = useSession()
  const shown = useMediaQuery(shownWhen)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [more, setMore] = useState(false)

  useEffect(() => {
    if (!session || !shown) return

    const controller = new AbortController()

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json()
        setNotifications(data.notifications)
        setMore(data.more)
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
  }, [session, shown])

  return { signedIn: Boolean(session), notifications, setNotifications, unreadCount, setUnreadCount, more }
}
