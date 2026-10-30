'use client'

import { useState } from 'react'
import { TILE_GRID } from '@/components/SelectableTile'
import { focusRing } from '@/components/ui/focus'

export interface ReorderItem { id: string; src: string }

/** `list` with the item at `from` moved to `to`; unchanged when `to` is off either end. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const arrowClass = `grid h-8 w-8 place-items-center bg-black/60 text-white hover:bg-black/80 disabled:invisible ${focusRing}`

/**
 * Photos in an order the owner sets: an album's, a roll's frames. Drag one
 * onto another's place, or move it with its arrows on a phone or a keyboard.
 * Saving is the caller's; this only reports each new order.
 */
export default function ReorderGrid({ items, onReorder, numbered = false }: {
  items: ReorderItem[]
  onReorder: (next: ReorderItem[]) => void
  /** Frame numbers on each photo, for a roll. */
  numbered?: boolean
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  return (
    <ol className={TILE_GRID}>
      {items.map((item, i) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => setDragging(i)}
          onDragOver={event => {
            event.preventDefault()
            if (dragging !== null && dragging !== i) { onReorder(moveItem(items, dragging, i)); setDragging(i) }
          }}
          onDragEnd={() => setDragging(null)}
          className={`relative aspect-square cursor-grab overflow-hidden bg-neutral-900 ${dragging === i ? 'opacity-40' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a stored thumbnail, public or signed for the owner */}
          <img src={item.src} alt="" className="h-full w-full object-contain" draggable={false} />
          {numbered && <span className="absolute left-1.5 top-1.5 bg-black/70 px-1 text-[10px] tabular-nums text-white">{i + 1}</span>}
          <div className="absolute inset-x-0 bottom-0 flex justify-between">
            <button type="button" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0} onClick={() => onReorder(moveItem(items, i, i - 1))} className={arrowClass}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button type="button" aria-label={`Move photo ${i + 1} later`} disabled={i === items.length - 1} onClick={() => onReorder(moveItem(items, i, i + 1))} className={arrowClass}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </li>
      ))}
    </ol>
  )
}
