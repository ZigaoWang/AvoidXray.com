'use client'

import { useState, useEffect } from 'react'
import Modal, { UserRow } from './ui/Modal'
import { focusRing } from './ui/focus'

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
  // null means "not fetched yet", which is also what makes the spinner show,
  // and 'failed' means the request did not come back with a list. Deriving both
  // from the data rather than holding separate flags removes a render on open
  // and keeps them from disagreeing.
  const [users, setUsers] = useState<UserItem[] | 'failed' | null>(null)
  const loading = open && users === null

  useEffect(() => {
    if (!open) return

    let canceled = false
    fetch(`/api/${type}/${username}`)
      // A request that failed, or answered with something other than a list,
      // used to become an empty array, so a dropped connection rendered as
      // "No followers yet". That is a claim about the account rather than
      // about the request, and it was false.
      .then(r => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error()
        if (!canceled) setUsers(data)
      })
      .catch(() => { if (!canceled) setUsers('failed') })

    return () => { canceled = true }
  }, [open, username, type])

  return (
    <>
      <button
        type="button"
        // Opening always refetches, so the last answer is dropped first.
        // Otherwise a failure from an earlier open stayed on screen through
        // the whole of the next attempt.
        onClick={() => { setUsers(null); setOpen(true) }}
        aria-haspopup="dialog"
        className={`text-left hover:underline underline-offset-2 ${focusRing}`}
      >
        <span className="text-white font-bold">{count}</span>
        <span className="text-neutral-500 text-sm ml-1">{type === 'followers' ? (count === 1 ? 'follower' : 'followers') : 'following'}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={type === 'followers' ? 'Followers' : 'Following'}>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
          ) : users === 'failed' ? (
            <p className="py-8 text-center text-sm text-neutral-500">Could not load this just now.</p>
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
