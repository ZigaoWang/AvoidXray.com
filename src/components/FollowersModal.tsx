'use client'

import { useState, useEffect } from 'react'
import Modal, { UserRow } from './ui/Modal'

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
  // null means "not fetched yet", which is also what makes the spinner show.
  // Deriving it from the data rather than holding a separate loading flag
  // removes a render on open and keeps the two from disagreeing.
  const [users, setUsers] = useState<UserItem[] | null>(null)
  const loading = open && users === null

  useEffect(() => {
    if (!open) return

    let cancelled = false
    fetch(`/api/${type}/${username}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setUsers(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setUsers([]) })

    return () => { cancelled = true }
  }, [open, username, type])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="text-left hover:underline underline-offset-2
                   focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
                   focus-visible:outline-[#D32F2F]"
      >
        <span className="text-white font-bold">{count}</span>
        <span className="text-neutral-500 text-sm ml-1">{type === 'followers' ? (count === 1 ? 'follower' : 'followers') : 'following'}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={type === 'followers' ? 'Followers' : 'Following'}>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
          ) : users?.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No {type} yet</p>
          ) : users?.map(u => (
            <UserRow key={u.username} user={u} onNavigate={() => setOpen(false)} />
          ))}
        </div>
      </Modal>
    </>
  )
}
