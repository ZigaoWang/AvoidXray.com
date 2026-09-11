'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
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
      const total = cleaned.notifications + cleaned.moderationSubmissions
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
      {/* A card-shaped button inside a section that already carries the same
          title and a fuller description, in an orange nothing else uses. */}
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)} disabled={loading}>
        {loading ? 'Cleaning…' : 'Clean orphans'}
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Remove orphaned records?"
        confirmLabel="Remove"
        busyLabel="Removing…"
        onConfirm={handleCleanup}
        onClose={() => setConfirming(false)}
      >
        Notifications and moderation submissions left behind by deleted accounts. Photos and
        catalog entries are not affected.
      </ConfirmDialog>
    </>
  )
}
