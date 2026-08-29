'use client'

import { apiErrorMessage } from '@/lib/apiError'
import ConfirmDialog from './ui/ConfirmDialog'
import { useToast } from './ui/Toast'

/**
 * Confirms blocking an account, opened from the profile's overflow menu.
 *
 * Behind a confirmation because it also severs any follow in either direction,
 * which is not obvious from the word "block" and is not undone by unblocking.
 * Unblocking needs no confirmation and is done straight from the menu, so this
 * only ever handles the direction that loses something.
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

  async function submit() {
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
      onClose()
      onBlocked()
      toast(`Blocked @${username}`, 'success')
    } catch {
      toast('Could not reach the server', 'error')
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title={`Block @${username}?`}
      confirmLabel="Block"
      busyLabel="Blocking…"
      destructive
      onConfirm={submit}
      onClose={onClose}
    >
      You will not see their photos or comments, and they will not see yours. Any follow between
      you is removed, and unblocking does not restore it.
    </ConfirmDialog>
  )
}
