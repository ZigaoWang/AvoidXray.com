'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface UserItem {
  username: string
  name: string | null
  avatar: string | null
}

interface Props {
  username: string
  type: 'followers' | 'following'
  count: number
}

export default function FollowersModal({ username, type, count }: Props) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/${type}/${username}`)
      .then(r => r.json())
      .then(data => { setUsers(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, username, type])

  return (
    <>
      <button onClick={() => setOpen(true)} className="hover:underline underline-offset-2 text-left">
        <span className="text-white font-bold">{count}</span>
        <span className="text-neutral-500 text-sm ml-1">{type === 'followers' ? (count === 1 ? 'follower' : 'followers') : 'following'}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setOpen(false)}>
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-white capitalize">{type}</h3>
              <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-neutral-500 text-sm">Loading...</div>
              ) : users.length === 0 ? (
                <div className="py-8 text-center text-neutral-500 text-sm">No {type} yet</div>
              ) : users.map(u => (
                <Link key={u.username} href={`/${u.username}`} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition-colors">
                  <div className="w-9 h-9 bg-neutral-700 flex items-center justify-center text-sm font-bold overflow-hidden shrink-0">
                    {u.avatar ? (
                      <Image src={u.avatar} alt="" width={36} height={36} className="w-full h-full object-cover" />
                    ) : (
                      (u.name || u.username).charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.name || u.username}</p>
                    <p className="text-neutral-500 text-xs truncate">@{u.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
