'use client'

import { memo, useState, type MouseEvent } from 'react'
import Image from 'next/image'
import ReorderGrid from '@/components/ReorderGrid'
import SelectableTile, { TILE_GRID, tileCornerClass } from '@/components/SelectableTile'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import OverflowMenu from '@/components/ui/OverflowMenu'
import { sectionHeadingClass } from '@/components/ui/PageHeader'
import { blurPlaceholder } from '@/lib/blurhash'
import { rollHeader } from '@/lib/library/rollHeader'
import type { LibraryPhoto, LibraryRoll } from '@/lib/library/browse'

/** What every tile needs from the page: the selection, and how to select and open. */
export interface TileHandlers {
  selected: Set<string>
  /** A click on the tile: shift extends the run, anything else toggles. */
  onSelect: (id: string, event: MouseEvent) => void
  onOpen: (id: string) => void
}

function tileLabel(photo: LibraryPhoto, n: number) {
  const subject = photo.caption?.trim() || `photo ${n}`
  const gear = [photo.camera, photo.filmStock].filter(Boolean).join(' on ')
  const states = [photo.published ? 'published' : 'private', photo.held ? 'held for review' : ''].filter(Boolean).join(', ')
  return `Select ${subject}.${gear ? ` ${gear}.` : ''} Currently ${states}.`
}

/**
 * One photo in the library: the shared tile, the whole frame over its blurhash
 * so a slow connection never shows a blank square, its state as badges, and
 * the corner control that opens it in the viewer.
 */
export const LibraryTile = memo(function LibraryTile({ photo, index, selected, onSelect, onOpen }: {
  photo: LibraryPhoto
  index: number
  selected: boolean
  onSelect: TileHandlers['onSelect']
  onOpen: TileHandlers['onOpen']
}) {
  return (
    <SelectableTile
      photoId={photo.id}
      selected={selected}
      onSelect={event => onSelect(photo.id, event)}
      label={tileLabel(photo, index + 1)}
      image={
        <Image unoptimized fill src={photo.src} alt={photo.caption ?? ''} className="object-contain"
          sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1280px) 17vw, 200px"
          {...blurPlaceholder(photo.blurHash, index, Number.POSITIVE_INFINITY)} />
      }
      badges={!photo.published || photo.held ? (
        <>
          {!photo.published && <Badge>Private</Badge>}
          {photo.held && <Badge tone="warningSolid">Held for review</Badge>}
        </>
      ) : undefined}
      corner={
        <button type="button" onClick={() => onOpen(photo.id)} className={tileCornerClass}
          aria-label={`Open ${photo.caption?.trim() || `photo ${index + 1}`}`}>
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
      }
    />
  )
})

/** A run of library tiles in the shared grid. */
export function LibraryGrid({ photos, handlers }: { photos: LibraryPhoto[]; handlers: TileHandlers }) {
  return (
    <ul className={TILE_GRID}>
      {photos.map((photo, i) => (
        <li key={photo.id}>
          <LibraryTile photo={photo} index={i} selected={handlers.selected.has(photo.id)} onSelect={handlers.onSelect} onOpen={handlers.onOpen} />
        </li>
      ))}
    </ul>
  )
}

export interface RollActions {
  onEdit: (roll: LibraryRoll) => void
  onSelectAll: (roll: LibraryRoll) => void
  onMerge: (roll: LibraryRoll) => void
  onDelete: (roll: LibraryRoll) => void
  onSaveOrder: (roll: LibraryRoll, photoIds: string[]) => Promise<void>
}

/** A roll as a contact sheet: its header line, its counts, its actions and its frames. */
export function RollSection({ roll, handlers, actions }: { roll: LibraryRoll; handlers: TileHandlers; actions: RollActions }) {
  const [order, setOrder] = useState<LibraryPhoto[] | null>(null)
  const [saving, setSaving] = useState(false)
  const header = rollHeader(roll)
  const name = roll.title || header || 'Untitled roll'
  const shown = roll.photos.length < roll.photoCount ? `${roll.photos.length} of ${roll.photoCount} photos` : `${roll.photoCount} ${roll.photoCount === 1 ? 'photo' : 'photos'}`
  const complete = roll.photos.length === roll.photoCount

  return (
    <section className="border-t border-neutral-800 pt-6 [content-visibility:auto] [contain-intrinsic-size:auto_420px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className={`${sectionHeadingClass} truncate`}>{name}</h2>
          {roll.title && header && <p className="truncate text-sm text-neutral-400">{header}</p>}
          <p className="text-sm text-neutral-500">{shown} · {roll.publishedCount} published</p>
        </div>
        {order ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setOrder(null)} disabled={saving}>Cancel</Button>
            <Button size="sm" disabled={saving} onClick={async () => {
              setSaving(true)
              try { await actions.onSaveOrder(roll, order.map(p => p.id)); setOrder(null) } finally { setSaving(false) }
            }}>{saving ? 'Saving…' : 'Save order'}</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => actions.onSelectAll(roll)}>Select all</Button>
            <OverflowMenu
              label={`Actions for ${name}`}
              items={[
                { label: 'Edit details', onSelect: () => actions.onEdit(roll) },
                // Only with every frame on screen: a filtered roll cannot be put in order.
                ...(complete && roll.photoCount > 1 ? [{ label: 'Reorder frames', onSelect: () => setOrder(roll.photos) }] : []),
                { label: 'Merge into another roll', onSelect: () => actions.onMerge(roll) },
                { label: 'Delete roll', onSelect: () => actions.onDelete(roll), destructive: true, startsGroup: true },
              ]}
            />
          </div>
        )}
      </div>
      {order ? (
        <ReorderGrid numbered items={order.map(p => ({ id: p.id, src: p.src }))}
          onReorder={next => setOrder(next.map(item => order.find(p => p.id === item.id)!))} />
      ) : (
        <LibraryGrid photos={roll.photos} handlers={handlers} />
      )}
    </section>
  )
}
