'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

/** Removes records left behind by deleted accounts. */
export default function OrphanCleanupButton() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleCleanup = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cleanup' }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Cleanup failed'), 'error')
        return
      }
      const { cleaned } = await res.json()
      const total =
        cleaned.notifications + cleaned.moderationSubmissions + cleaned.cameras + cleaned.filmStocks
      // One line rather than the four-line list the alert used: the detail is
      // on screen after the refresh anyway.
      toast(total === 0 ? 'Nothing to clean up' : `Removed ${total} orphaned records`, 'success')
      router.refresh()
    } catch {
      toast('Cleanup failed', 'error')
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={loading}
        className="bg-neutral-900 p-4 hover:bg-neutral-800 transition-colors text-left disabled:opacity-50"
      >
        <div className="text-sm font-bold text-orange-500">
          {loading ? 'Cleaning…' : 'Clean Orphans'}
        </div>
        <div className="text-neutral-500 text-xs">Remove records from deleted users</div>
      </button>

      <ConfirmDialog
        open={confirming}
        title="Remove orphaned records?"
        confirmLabel="Remove"
        busyLabel="Removing…"
        destructive
        onConfirm={handleCleanup}
        onClose={() => setConfirming(false)}
      >
        Notifications, moderation submissions and unused cameras and film stocks left behind by
        deleted accounts. Photos are not affected.
      </ConfirmDialog>
    </>
  )
}
