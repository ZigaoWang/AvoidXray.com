'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'

interface Notification {
  id: string
  type: 'like' | 'comment' | 'follow'
  read: boolean
  createdAt: string
  actor: { username: string; name: string | null; avatar: string | null } | null
  photo: { id: string; thumbnailPath: string } | null
}

export default function NotificationBell() {
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session) return

    const fetchNotifications = async () => {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [session])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleOpen = async () => {
    setOpen(!open)
    if (!open && unreadCount > 0) {
      await fetch('/api/notifications', { method: 'PATCH' })
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
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
        onClick={handleOpen}
        className="relative text-neutral-400 hover:text-white transition-colors p-1"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[10px] font-bold flex items-center justify-center rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-neutral-900 border border-neutral-800 shadow-xl z-50 animate-slide-down">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
          </div>
          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-neutral-500 text-sm">
                No notifications yet
              </div>
            ) : (
            notifications.filter(n => n.actor).map(n => (
                <div
                  key={n.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${!n.read ? 'bg-neutral-800/50' : ''}`}
                >
                  <Link href={`/${n.actor!.username}`} onClick={() => setOpen(false)} className="w-8 h-8 bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity">
                    {n.actor!.avatar ? (
                      <Image src={n.actor!.avatar} alt="" width={32} height={32} className="w-full h-full object-cover" />
                    ) : (
                      (n.actor!.name || n.actor!.username).charAt(0).toUpperCase()
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">
                      <Link href={`/${n.actor!.username}`} onClick={() => setOpen(false)} className="font-medium hover:underline">{n.actor!.name || n.actor!.username}</Link>{' '}
                      {n.photo ? (
                        <Link href={`/photos/${n.photo.id}`} onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white">{getMessage(n)}</Link>
                      ) : (
                        <span className="text-neutral-400">{getMessage(n)}</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {n.photo && (
                    <Link href={`/photos/${n.photo.id}`} onClick={() => setOpen(false)} className="w-10 h-10 flex-shrink-0 hover:opacity-80 transition-opacity">
                      <Image src={n.photo.thumbnailPath} alt="" width={40} height={40} className="w-full h-full object-cover" />
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
