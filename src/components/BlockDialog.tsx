'use client'

import { useState } from 'react'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from './ui/Toast'

/**
 * Confirms blocking an account, opened from the profile's overflow menu.
 *
 * Behind a confirmation because it also severs any follow in either direction,
 * which is not obvious from the word "block" and is not undone by unblocking.
 * Unblocking needs no confirmation and is done straight from the menu, so this
 * dialog only ever handles the one direction that loses something.
 */
export default function BlockDialog({
  username,
  open,
  onClose,
  onBlocked,
}: {
  username: string
  open: boolean
  onClose: () => void
  onBlocked: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not update'), 'error')
        return
      }
      await res.json()
      onClose()
      onBlocked()
      toast(`Blocked @${username}`, 'success')
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-title"
            className="bg-neutral-900 border border-neutral-800 max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="block-title" className="text-lg font-bold text-white mb-2">Block @{username}?</h2>
            <p className="text-neutral-400 text-sm mb-6">
              You will not see their photos or comments, and they will not see yours.
              Any follow between you is removed, and unblocking does not restore it.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={busy}
                className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-[#D32F2F] text-white hover:bg-[#B71C1C] disabled:opacity-40"
              >
                {busy ? 'Blocking…' : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
