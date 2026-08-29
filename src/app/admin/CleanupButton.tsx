'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

/**
 * Deletes unpublished photos and their stored files.
 *
 * Used the browser's confirm and alert, which is the one part of the site an
 * administrator sees most and the last place a destructive action should be
 * relying on an OS box that cannot say what it is about to remove.
 */
export default function CleanupButton() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleCleanup = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/upload/cleanup', { method: 'DELETE' })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Cleanup failed'), 'error')
        return
      }
      const data = await res.json()
      toast(
        data.deleted === 0
          ? 'Nothing to clean up'
          : `Deleted ${data.deleted} unpublished photo${data.deleted === 1 ? '' : 's'}`,
        'success'
      )
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
        className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-2 py-1 disabled:opacity-50"
      >
        {loading ? 'Cleaning…' : 'Clean'}
      </button>

      <ConfirmDialog
        open={confirming}
        title="Delete unpublished photos?"
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        onConfirm={handleCleanup}
        onClose={() => setConfirming(false)}
      >
        Every unfinished upload is removed, along with its files in object storage. This cannot be
        undone.
      </ConfirmDialog>
    </>
  )
}
