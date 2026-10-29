'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

/**
 * The order of an album's photos: drag them, or move one with its arrows on a
 * phone or a keyboard, then save.
 */
export default function AlbumOrder({ albumId, photos }: {
  albumId: string
  photos: { id: string; thumbnailPath: string }[]
}) {
  const { toast } = useToast()
  const [order, setOrder] = useState(photos)
  const [dragging, setDragging] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const changed = order.some((p, i) => p.id !== photos[i]?.id)

  const move = (from: number, to: number) => setOrder(list => {
    if (to < 0 || to >= list.length) return list
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  })

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
      <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
        {order.map((photo, i) => (
          <li key={photo.id} draggable
            onDragStart={() => setDragging(i)}
            onDragOver={event => { event.preventDefault(); if (dragging !== null && dragging !== i) { move(dragging, i); setDragging(i) } }}
            onDragEnd={() => setDragging(null)}
            className={`relative cursor-grab ${dragging === i ? 'opacity-40' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- stored thumbnail */}
            <img src={photo.thumbnailPath} alt="" className="aspect-square w-full object-cover" draggable={false} />
            <div className="absolute inset-x-0 bottom-0 flex justify-between">
              <button type="button" aria-label="Earlier" onClick={() => move(i, i - 1)} className="h-8 w-8 bg-black/60 text-white">‹</button>
              <button type="button" aria-label="Later" onClick={() => move(i, i + 1)} className="h-8 w-8 bg-black/60 text-white">›</button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
