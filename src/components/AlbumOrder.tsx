'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'
import ReorderGrid, { type ReorderItem } from '@/components/ReorderGrid'

/**
 * The order of an album's photos: drag them, or move one with its arrows on a
 * phone or a keyboard, then save.
 */
export default function AlbumOrder({ albumId, photos }: {
  albumId: string
  photos: { id: string; thumbnailPath: string }[]
}) {
  const { toast } = useToast()
  const [order, setOrder] = useState<ReorderItem[]>(() => photos.map(p => ({ id: p.id, src: p.thumbnailPath })))
  const [saving, setSaving] = useState(false)
  const changed = order.some((p, i) => p.id !== photos[i]?.id)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/albums/${albumId}/order`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoIds: order.map(p => p.id) }),
      })
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not save the order'))
      toast('Order saved', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the order', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (photos.length < 2) return null
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-400">Drag to change the order the album shows them in.</p>
        <Button size="sm" disabled={!changed || saving} onClick={save}>{saving ? 'Saving…' : 'Save order'}</Button>
      </div>
      <ReorderGrid items={order} onReorder={setOrder} />
    </div>
  )
}
