'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/ui/Button'

/**
 * One photo the nudity check flagged. Blurred until asked, since the point of
 * the queue is that some of these are what the check thinks they are.
 */
export default function ScreenedPhoto({ photo }: {
  photo: { id: string; thumbnailPath: string; nudityScore: number | null; screening: 'HELD' | 'REJECTED'; username: string; createdAt: string }
}) {
  const router = useRouter()
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Delete asks twice, in place: it is the one decision here that cannot be undone.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function decide(action: 'approve' | 'reject' | 'delete') {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/admin/screening/${photo.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? 'That did not work. Try again.')
      return
    }
    router.refresh()
  }

  return (
    <li className="border border-neutral-800 bg-neutral-900">
      <button
        type="button"
        onClick={() => setRevealed(r => !r)}
        className="relative block w-full aspect-square overflow-hidden bg-neutral-950"
        aria-label={revealed ? 'Blur photo' : 'Show photo'}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumbnailPath}
          alt=""
          className={`h-full w-full object-cover transition ${revealed ? '' : 'blur-2xl scale-110'}`}
        />
        {!revealed && (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-white">Show photo</span>
        )}
      </button>
      <div className="p-3 space-y-3">
        <p className="text-xs text-neutral-400">
          <Link href={`/${photo.username}`} className="text-white hover:text-brand">@{photo.username}</Link>
          {' · '}{photo.nudityScore === null ? 'could not be checked' : `score ${photo.nudityScore.toFixed(2)}`}
          {' · '}{new Date(photo.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' · '}<Link href={`/photos/${photo.id}`} className="hover:text-white">Open</Link>
        </p>
        {error && <p role="alert" className="text-xs text-brand">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide('approve')}>
            {photo.screening === 'HELD' ? 'Approve' : 'Restore'}
          </Button>
          {photo.screening === 'HELD' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide('reject')}>
              Keep hidden
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => (confirmingDelete ? decide('delete') : setConfirmingDelete(true))}
            onBlur={() => setConfirmingDelete(false)}
          >
            {confirmingDelete ? 'Confirm delete' : 'Delete'}
          </Button>
        </div>
      </div>
    </li>
  )
}
