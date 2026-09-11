'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import EmptyState, { PhotoIcon } from '@/components/ui/EmptyState'
import FieldLabel from '@/components/ui/FieldLabel'
import { FieldInput } from '@/components/ui/Field'
import FilterPill from '@/components/ui/FilterPill'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

export type PickerPhoto = {
  id: string
  thumbnailPath: string
  caption: string | null
}

const PAGE_SIZE = 60

/**
 * Choosing photos for an album.
 *
 * Creating an album and editing one are the same picker, and both were a
 * grid of `/api/photos/mine?pageSize=200` with the total thrown away: past
 * two hundred frames the grid simply stopped, with nothing on screen saying
 * there were more. On the edit page that was a correctness bug rather than an
 * inconvenience — a member photo older than the two hundredth was still
 * counted in "N photos selected" but had no tile, so it could not be taken
 * out of the album by any means the page offered.
 *
 * The paging, the caption search and the count are ManagePhotos', which is the
 * other screen driving this endpoint; a second pager with its own manners would
 * have been the thing this file exists to avoid.
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
   * already carries. Without them, "deselect" would depend on the photo
   * happening to land on the page you are looking at.
   */
  pinned?: PickerPhoto[]
  /** Advice for the account that has no photos at all. */
  emptyHint: string
}) {
  // Prefix for this picker's control ids, so the label points at its own
  // field even if a page ever renders two.
  const fid = useId()

  const { toast } = useToast()

  const [photos, setPhotos] = useState<PickerPhoto[]>([])
  /**
   * Every photo this picker has put on screen, by id.
   *
   * The album view resolves ids to tiles through this, so a photo selected on
   * page one still has a tile after you turn to page five. It only grows;
   * dropping a page's photos from it would take that tile away again.
   */
  const [seen, setSeen] = useState<Record<string, PickerPhoto>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  /** Which set of photos the grid is showing. */
  const [view, setView] = useState<'all' | 'album'>('all')

  const requestId = useRef(0)

  /**
   * Which pager button asked for the page now on its way, if a press is what
   * asked for it.
   *
   * Both buttons go disabled while the request is in flight, and a browser
   * blurs a control the moment it is disabled — so pressing Next left a
   * keyboard reader on the document body, and on the last page the control
   * they were on never came back at all. This is also what tells a page turn
   * apart from the first load and from a search, which are not turns and are
   * not worth announcing as ones.
   */
  const pagerPress = useRef<'prev' | 'next' | null>(null)
  const prevButton = useRef<HTMLButtonElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  /**
   * A finished page turn: where focus should go back to, and what to say
   * about the photos that replaced the ones on screen. A new object every
   * time, so the effect below runs on every turn rather than only on the
   * turns whose wording happens to differ.
   */
  const [turned, setTurned] = useState<{ by: 'prev' | 'next'; say: string } | null>(null)

  const load = useCallback(async () => {
    const id = ++requestId.current
    // Read at the start rather than at the end, so a page that fails to
    // arrive still puts focus back, and so a press left over from a request
    // that was superseded cannot be announced against a later search.
    const by = pagerPress.current
    pagerPress.current = null
    setLoading(true)
    let say = ''
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), search })
      const res = await fetch(`/api/photos/mine?${params}`)
      if (id !== requestId.current) return
      if (!res.ok) { toast(await apiErrorMessage(res, 'Could not load your photos'), 'error'); return }
      const data = await res.json()
      // Reading the body is another await, so the check is repeated: a page
      // that arrived first but parsed slowly could otherwise overwrite the
      // newer one that had already been applied.
      if (id !== requestId.current) return
      const list: PickerPhoto[] = Array.isArray(data?.photos) ? data.photos : []
      setPhotos(list)
      setTotal(data?.total ?? 0)
      setSeen(prev => {
        const next = { ...prev }
        for (const photo of list) next[photo.id] = photo
        return next
      })
      const of = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
      say = `Page ${page} of ${of}, ${list.length} photo${list.length === 1 ? '' : 's'}`
    } catch {
      if (id === requestId.current) toast('Could not reach the server', 'error')
    } finally {
      if (id === requestId.current) {
        setLoading(false)
        // Nothing is said about a page that did not arrive — the toast has
        // already spoken — but focus goes back either way.
        if (by) setTurned({ by, say })
      }
    }
  }, [page, search, toast])

  useEffect(() => { load() }, [load])

  /**
   * Puts focus back where the page turn took it from.
   *
   * The button that was pressed if it is still live, and the other one when
   * reaching the first or last page has just disabled it — which keeps the
   * reader in the pager either way, rather than at the top of the document.
   */
  useEffect(() => {
    if (!turned) return
    const asked = turned.by === 'next' ? nextButton.current : prevButton.current
    const other = turned.by === 'next' ? prevButton.current : nextButton.current
    const active = document.activeElement
    // Only when the disabling actually dropped focus, so a reader who moved
    // on while the page loaded is not dragged back to the pager. Focus left
    // sitting on the button that is now disabled counts as dropped as well:
    // it is a dead control, and the keys do nothing from there.
    if (active && active !== document.body && !(active === asked && asked?.disabled)) return
    const landing = asked && !asked.disabled ? asked : other
    if (landing && !landing.disabled) landing.focus()
  }, [turned])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  /**
   * The selection deliberately outlives a page turn and a search.
   *
   * ManagePhotos clears its selection whenever the list underneath changes,
   * because there the selection is an argument to a bulk delete and must not
   * reach photos you cannot see. Here the selection *is* the album, so it
   * lives on the page above this component and nothing in here touches it:
   * select three, search, come back, and the same three are still selected.
   */
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  /**
   * The album as it stands: its current members, plus whatever has been picked
   * up while browsing.
   *
   * The members come from `pinned` rather than from whichever page happens to
   * be loaded, which is the whole point — that is what makes every one of them
   * deselectable. They stay in this view after being deselected as well, so
   * taking a photo out by mistake does not send you hunting back through the
   * paging for it.
   */
  const inAlbum = useMemo(() => {
    const byId: Record<string, PickerPhoto> = { ...seen }
    for (const photo of pinned) byId[photo.id] = photo
    const needle = search.trim().toLowerCase()
    return [...new Set([...pinned.map(photo => photo.id), ...selectedIds])]
      .map(id => byId[id])
      .filter((photo): photo is PickerPhoto =>
        Boolean(photo) && (!needle || (photo.caption ?? '').toLowerCase().includes(needle)))
  }, [seen, pinned, selectedIds, search])

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const shown = view === 'all' ? photos : inAlbum

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <FieldLabel htmlFor={`${fid}-photo-search`} className="sr-only">Search your captions</FieldLabel>
          <FieldInput
            id={`${fid}-photo-search`}
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search your captions…"
          />
        </div>
        {/* The number the grid used to leave unsaid — how many photos are
            behind it, and while searching, how many the search found. */}
        <span className="text-xs text-neutral-500 tabular-nums">
          {view === 'album'
            ? `${selectedIds.length.toLocaleString()} selected`
            : loading
              ? 'Loading…'
              : `${total.toLocaleString()} photo${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* The same pills as the photo manager's filters, now literally the same
          component. "This album" is the one view that does not depend on
          paging, so a member from two years ago is always one click from being
          taken out. */}
      <div className="flex flex-wrap gap-1 mb-4">
        {([
          { value: 'all', label: 'All photos' },
          { value: 'album', label: 'This album' },
        ] as const).map(tab => (
          <FilterPill
            key={tab.value}
            pressed={view === tab.value}
            onClick={() => setView(tab.value)}
          >
            {tab.label}
          </FilterPill>
        ))}
      </div>

      {/* The album view is built from what the page already has, so it says so
          straight away; only the browsing view waits for a response. */}
      {shown.length === 0 && (view === 'album' || !loading) && (
        view === 'album' ? (
          <EmptyState
            size="compact"
            message={search ? 'Nothing in this album matches this search.' : 'No photos in this album yet.'}
          />
        ) : search ? (
          <EmptyState size="compact" message="No photos match this search." />
        ) : (
          <EmptyState
            icon={<PhotoIcon />}
            message="No photos in your account yet"
            hint={emptyHint}
            action={{ href: '/upload', label: 'Upload photos' }}
          />
        )
      )}

      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
        {shown.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => onToggle(photo.id)}
            aria-pressed={selected.has(photo.id)}
            aria-label={`Select ${photo.caption?.trim() || `photo ${index + 1}`}`}
            className={`aspect-square relative overflow-hidden transition-all ${
              selected.has(photo.id)
                ? 'ring-4 ring-brand scale-[0.95]'
                : 'hover:opacity-80'
            }`}
          >
            <Image
              src={photo.thumbnailPath}
              alt={photo.caption || ''}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 33vw, 20vw"
            />
            {selected.has(photo.id) && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-brand rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Only the browsing view is paged; the selected view is already the
          whole of it. Outline, the weight the album index pager uses — the
          one filled button on this screen is the one that saves the album. */}
      {view === 'all' && lastPage > 1 && (
        <nav className="flex items-center justify-between mt-6" aria-label="Pagination">
          <p className="text-xs text-neutral-600 tabular-nums">Page {page} of {lastPage}</p>
          <div className="flex gap-2">
            <Button
              ref={prevButton}
              variant="outline"
              size="sm"
              onClick={() => { pagerPress.current = 'prev'; setPage(p => Math.max(1, p - 1)) }}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              ref={nextButton}
              variant="outline"
              size="sm"
              onClick={() => { pagerPress.current = 'next'; setPage(p => Math.min(lastPage, p + 1)) }}
              disabled={page >= lastPage || loading}
            >
              Next
            </Button>
          </div>
        </nav>
      )}

      {/* Turning a page swaps the whole grid for other photos, which is a
          silent change to anyone not looking at it. Rendered even when there
          is nothing to say, so the region exists before it has to speak —
          one added along with its first message is not announced. */}
      <p aria-live="polite" className="sr-only">{turned?.say ?? ''}</p>
    </div>
  )
}
