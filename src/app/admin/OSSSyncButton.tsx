'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

export default function OSSSyncButton() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ ossTotal: number; dbTotal: number; orphaned: number } | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const [confirming, setConfirming] = useState(false)

  const checkOrphans = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/oss-sync')
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Check failed'), 'error')
        return
      }
      setStatus(await res.json())
    } catch {
      toast('Check failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const cleanOrphans = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/oss-sync', { method: 'DELETE' })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Cleanup failed'), 'error')
        return
      }
      const data = await res.json()
      toast(`Deleted ${data.deleted} orphaned file${data.deleted === 1 ? '' : 's'}`, 'success')
      setStatus(null)
      router.refresh()
    } catch {
      toast('Cleanup failed', 'error')
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    // The maintenance page already frames each tool in a titled section, so
    // this no longer repeats "OSS Storage / Sync files with database" inside
    // its own second card.
    <div>
      <Button variant="secondary" size="sm" onClick={checkOrphans} disabled={loading}>
        {loading ? 'Checking…' : 'Check'}
      </Button>

      {status && (
        <div className="mt-4 pt-4 border-t border-neutral-800">
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div>
              <div className="text-white font-bold">{status.ossTotal}</div>
              <div className="text-neutral-500 text-xs">OSS Files</div>
            </div>
            <div>
              <div className="text-white font-bold">{status.dbTotal}</div>
              <div className="text-neutral-500 text-xs">DB Records</div>
            </div>
            <div>
              <div className={`font-bold ${status.orphaned > 0 ? 'text-yellow-500' : 'text-green-400'}`}>
                {status.orphaned}
              </div>
              <div className="text-neutral-500 text-xs">Orphaned</div>
            </div>
          </div>

          {status.orphaned > 0 && (
            <Button size="sm" fullWidth onClick={() => setConfirming(true)} disabled={loading}>
              {loading ? 'Deleting…' : `Delete ${status.orphaned} orphaned files`}
            </Button>
          )}

          {status.orphaned === 0 && (
            <div className="text-center text-green-400 text-sm">All files synced</div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Delete ${status?.orphaned ?? 0} orphaned files?`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        onConfirm={cleanOrphans}
        onClose={() => setConfirming(false)}
      >
        These are files in object storage with no database record pointing at them. Nothing on the
        site references them, and this cannot be undone.
      </ConfirmDialog>
    </div>
  )
}
