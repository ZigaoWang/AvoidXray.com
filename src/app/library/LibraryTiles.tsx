'use client'

import { memo, useState } from 'react'
import Button from '@/components/ui/Button'
import { rollHeader } from '@/lib/library/rollHeader'
import type { LibraryPhoto, LibraryRoll } from '@/lib/library/browse'
import { useLongPress } from './useSelection'

/** One photo in a contact sheet. Opens the viewer, or toggles while selecting. */
export const PhotoTile = memo(function PhotoTile({ photo, selected, selecting, onOpen, onToggle, onExtend }: {
  photo: LibraryPhoto
  selected: boolean
  selecting: boolean
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onExtend: (id: string) => void
}) {
  const press = useLongPress(() => onToggle(photo.id))
  return (
    <div className="group relative" data-photo-id={photo.id}>
      <button
        type="button"
        {...press.handlers}
        onClick={event => {
          if (press.consumed()) return
          if (event.shiftKey) onExtend(photo.id)
          else if (event.metaKey || event.ctrlKey || selecting) onToggle(photo.id)
          else onOpen(photo.id)
        }}
        aria-pressed={selecting ? selected : undefined}
        aria-label={`${photo.caption || 'Photo'}${photo.published ? ', published' : ', private'}${selected ? ', selected' : ''}`}
        className={`block aspect-square w-full overflow-hidden bg-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-brand
          ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0a]' : ''}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- stored thumbnails, public or signed for the owner; never through the optimizer */}
        <img src={photo.src} alt="" loading="lazy" decoding="async" draggable={false}
          className={`h-full w-full object-cover transition-transform ${selected ? 'scale-[0.92]' : ''}`} />
      </button>
      {/* The check: always there on touch, on hover with a pointer. */}
      <button
        type="button"
        onClick={event => (event.shiftKey ? onExtend(photo.id) : onToggle(photo.id))}
        aria-label={selected ? 'Deselect' : 'Select'}
        className={`absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border text-xs
          ${selected ? 'border-white bg-white text-black' : 'border-white/70 bg-black/40 text-transparent'}
          ${selected || selecting ? 'opacity-100' : 'opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
      >
        ✓
      </button>
      {photo.published && <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-green-400" title="Published" />}
      {photo.held && <span className="absolute bottom-1 left-1 bg-yellow-500/90 px-1 text-[10px] text-black">Held</span>}
    </div>
  )
})

export interface RollActions {
  onEdit: (roll: LibraryRoll) => void
  onSelectAll: (roll: LibraryRoll) => void
  onMerge: (roll: LibraryRoll) => void
  onDelete: (roll: LibraryRoll) => void
  onSaveOrder: (roll: LibraryRoll, photoIds: string[]) => Promise<void>
}

/** A roll as a contact sheet: the header line, its counts, and its frames. */
export function RollSection({ roll, selected, selecting, onOpen, onToggle, onExtend, actions }: {
  roll: LibraryRoll
  selected: Set<string>
  selecting: boolean
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onExtend: (id: string) => void
  actions: RollActions
}) {
  const [order, setOrder] = useState<LibraryPhoto[] | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const header = rollHeader(roll)
  const shown = roll.photos.length < roll.photoCount ? `${roll.photos.length} of ${roll.photoCount} photos` : `${roll.photoCount} ${roll.photoCount === 1 ? 'photo' : 'photos'}`

  const move = (from: number, to: number) => setOrder(list => {
    if (!list || to < 0 || to >= list.length) return list
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  })

  return (
    <section className="border-t border-neutral-800 pt-4 [content-visibility:auto] [contain-intrinsic-size:auto_420px]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-white">{roll.title || header || 'Untitled roll'}</h2>
          {roll.title && header && <p className="truncate text-sm text-neutral-300">{header}</p>}
          <p className="text-xs text-neutral-500">{shown} · {roll.publishedCount} published</p>
        </div>
        {order ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOrder(null)} disabled={saving}>Cancel</Button>
            <Button size="sm" disabled={saving} onClick={async () => {
              setSaving(true)
              try { await actions.onSaveOrder(roll, order.map(p => p.id)); setOrder(null) } finally { setSaving(false) }
            }}>{saving ? 'Saving…' : 'Save order'}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => actions.onSelectAll(roll)}>Select all</Button>
            <Button size="sm" variant="outline" onClick={() => actions.onEdit(roll)}>Edit details</Button>
            <select
              aria-label={`More actions for ${roll.title || header || 'this roll'}`}
              value=""
              onChange={event => {
                const action = event.target.value
                if (action === 'reorder') setOrder(roll.photos)
                if (action === 'merge') actions.onMerge(roll)
                if (action === 'delete') actions.onDelete(roll)
              }}
              className="h-8 border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-300"
            >
              <option value="">More…</option>
              {roll.photos.length === roll.photoCount && roll.photoCount > 1 && <option value="reorder">Reorder frames</option>}
              <option value="merge">Merge into another roll</option>
              <option value="delete">Delete roll</option>
            </select>
          </div>
        )}
      </div>

      {order ? (
        <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-9">
          {order.map((photo, i) => (
            <li
              key={photo.id}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={event => { event.preventDefault(); if (dragging !== null && dragging !== i) { move(dragging, i); setDragging(i) } }}
              onDragEnd={() => setDragging(null)}
              className={`relative cursor-grab ${dragging === i ? 'opacity-40' : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- stored thumbnail */}
              <img src={photo.src} alt="" className="aspect-square w-full object-cover" draggable={false} />
              <span className="absolute left-1 top-1 bg-black/70 px-1 text-[10px] text-white">{i + 1}</span>
              <div className="absolute inset-x-0 bottom-0 flex justify-between">
                <button type="button" aria-label="Earlier" onClick={() => move(i, i - 1)} className="h-8 w-8 bg-black/60 text-white">‹</button>
                <button type="button" aria-label="Later" onClick={() => move(i, i + 1)} className="h-8 w-8 bg-black/60 text-white">›</button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-9">
          {roll.photos.map(photo => (
            <li key={photo.id}>
              <PhotoTile photo={photo} selected={selected.has(photo.id)} selecting={selecting}
                onOpen={onOpen} onToggle={onToggle} onExtend={onExtend} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
