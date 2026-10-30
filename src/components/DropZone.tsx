'use client'

import { useState, type DragEvent, type ReactNode } from 'react'

/**
 * The dashed area files are dropped on: upload and import.
 *
 * The file input inside it is the caller's, kept sr-only rather than hidden so
 * it stays in the tab order; focus-within puts the ring on the zone so that
 * focus can be seen.
 */
export default function DropZone({ onDrop, children }: {
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  children: ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onDrop={event => { event.preventDefault(); setDragging(false); onDrop(event) }}
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={event => { event.preventDefault(); setDragging(false) }}
      className={`border-2 border-dashed p-10 text-center transition-all
                  focus-within:border-brand focus-within:ring-1 focus-within:ring-brand
                  ${dragging ? 'border-brand bg-brand/5' : 'border-neutral-700 hover:border-neutral-600'}`}
    >
      {children}
    </div>
  )
}
