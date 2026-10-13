'use client'

import { useState } from 'react'
import Modal from './ui/Modal'
import PeopleList from './PeopleList'
import { focusRing } from './ui/focus'

interface Props {
  username: string
  type: 'followers' | 'following'
  count: number
}

export default function FollowersModal({ username, type, count }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`text-left hover:underline underline-offset-2 ${focusRing}`}
      >
        <span className="text-white font-bold">{count}</span>
        <span className="text-neutral-500 text-sm ml-1">{type === 'followers' ? (count === 1 ? 'follower' : 'followers') : 'following'}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={type === 'followers' ? 'Followers' : 'Following'}>
        <div className="max-h-96 overflow-y-auto">
          {/* Mounted only while open, so every opening asks again. */}
          {open && (
            <PeopleList
              url={`/api/${type}/${encodeURIComponent(username)}`}
              emptyMessage={type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              onNavigate={() => setOpen(false)}
            />
          )}
        </div>
      </Modal>
    </>
  )
}
