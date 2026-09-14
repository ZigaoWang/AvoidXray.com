'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import EmptyState, { PhotoIcon } from '@/components/ui/EmptyState'
import FilterPill from '@/components/ui/FilterPill'
import PhotoBrowser, { type BrowserPhoto } from '@/components/PhotoBrowser'

export type PickerPhoto = BrowserPhoto

/**
 * Choosing photos for an album.
 *
 * Creating an album and editing one are the same picker, and both were a grid
 * of `/api/photos/mine?pageSize=200` with the total thrown away: past two
 * hundred frames the grid simply stopped, with nothing on screen saying there
 * were more. On the edit page that was a correctness bug rather than an
 * inconvenience — a member photo older than the two hundredth was still counted
 * in "N photos selected" but had no tile, so it could not be taken out of the
 * album by any means the page offered.
 *
 * The browsing, the search, the filters and the paging are PhotoBrowser's now,
 * which the photo manager uses too. They were this file's before, copied there,
 * and the two copies had already come apart: one kept a selection across a page
 * turn and the other threw it away.
 *
 * What is left here is the part that is about albums. "This album" is built
 * from the members the album's own response carries plus whatever has been
 * picked up while browsing, so it never depends on paging — which is what makes
 * a photo added two years ago one click from being taken out.
 */
export default function AlbumPhotoPicker({
  selectedIds,
  onToggle,
  pinned = [],
  emptyHint,
}: {
  selectedIds: string[]
  onToggle: (photoId: string) => void
  /**
   * Photos that must stay reachable however the browsing is paged or
   * searched — an album's current members, which the album's own response
   * already carries.
   */
  pinned?: PickerPhoto[]
  /** Advice for the account that has no photos at all. */
  emptyHint: string
}) {
  /** Which set of photos the grid is showing. */
  const [view, setView] = useState<'all' | 'album'>('all')
  /** Photos the browser has shown, so a member has a tile whatever page it is on. */
  const [seen, setSeen] = useState<Record<string, PickerPhoto>>({})

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  /**
   * The album owns membership one photo at a time, so a set that arrives whole
   * is reported as the difference from the one that was there. That is what
   * lets a shift-click range, or Select all, reach an album form written
   * against a single toggle.
   */
  const applySelection = (next: Set<string>) => {
    for (const id of next) if (!selected.has(id)) onToggle(id)
    for (const id of selected) if (!next.has(id)) onToggle(id)
  }

  const inAlbum = useMemo(() => {
    const byId: Record<string, PickerPhoto> = { ...seen }
    for (const photo of pinned) byId[photo.id] = photo
    // Members and picks together, and they stay listed after being deselected
    // so taking one out by mistake does not send you hunting through the paging.
    return [...new Set([...pinned.map(p => p.id), ...selectedIds])]
      .map(id => byId[id])
      .filter((photo): photo is PickerPhoto => Boolean(photo))
  }, [seen, pinned, selectedIds])

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-4">
        {([
          { value: 'all', label: 'All photos' },
          { value: 'album', label: `This album (${selectedIds.length})` },
        ] as const).map(tab => (
          <FilterPill key={tab.value} pressed={view === tab.value} onClick={() => setView(tab.value)}>
            {tab.label}
          </FilterPill>
        ))}
      </div>

      {/* Both views stay mounted: the browser holds the filters and the page
          somebody was in the middle of, and flipping to check what is in the
          album should not throw that away. */}
      <div className={view === 'all' ? '' : 'hidden'}>
        <PhotoBrowser
          selected={selected}
          onSelectedChange={applySelection}
          pinned={pinned}
          showState={false}
          emptyHint={emptyHint}
          onSeen={setSeen}
        />
      </div>

      {view === 'album' && (
        inAlbum.length === 0 ? (
          <EmptyState
            icon={<PhotoIcon />}
            size="compact"
            message="No photos in this album yet"
            hint={emptyHint}
          />
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-2">
            {inAlbum.map((photo, index) => {
              const shape = photo.width && photo.height ? photo.height / photo.width : 2 / 3
              const chosen = selected.has(photo.id)
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => onToggle(photo.id)}
                  aria-pressed={chosen}
                  aria-label={`${chosen ? 'Remove' : 'Add'} ${photo.caption?.trim() || `photo ${index + 1}`}`}
                  className={`relative mb-2 block w-full break-inside-avoid overflow-hidden bg-neutral-900 transition-all ${
                    chosen ? 'ring-2 ring-brand' : 'opacity-40 hover:opacity-70'
                  }`}
                >
                  <Image
                    src={photo.thumbnailPath}
                    alt={photo.caption || ''}
                    width={400}
                    height={Math.round(400 * shape)}
                    className="w-full block"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                  <span
                    className={`absolute top-1.5 left-1.5 w-5 h-5 grid place-items-center border ${
                      chosen ? 'bg-brand border-brand' : 'bg-black/50 border-white/40'
                    }`}
                    aria-hidden
                  >
                    {chosen && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
