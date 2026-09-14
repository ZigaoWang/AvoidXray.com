'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { blurPlaceholder } from '@/lib/blurhash'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import FilterPill from '@/components/ui/FilterPill'
import { fieldClass } from '@/components/ui/Field'
import { focusRing } from '@/components/ui/focus'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

export interface BrowserPhoto {
  id: string
  thumbnailPath: string
  caption: string | null
  /** The photograph's real proportions, so a tile can be its real shape. */
  width?: number | null
  height?: number | null
  blurHash?: string | null
  published?: boolean
  visibility?: 'PUBLIC' | 'PRIVATE'
  takenDate?: string | null
  cameraId?: string | null
  filmStockId?: string | null
  camera?: { name: string; brand?: string | null } | null
  filmStock?: { name: string; brand?: string | null } | null
}

type Facet = { id: string; name: string; count: number }
type Facets = { cameras: Facet[]; films: Facet[]; years: { year: number; count: number }[] }

const PAGE_SIZE = 60

/**
 * Columns per breakpoint, matching MasonryGrid's.
 *
 * The same shape as the rest of the site, because this is the rest of the site
 * — the same photographs, and a person moving between their profile and this
 * screen should not have to re-learn what a grid of their own work looks like.
 * A square crop of a 3:2 frame throws away a third of it, and every frame here
 * is 3:2: the library is 1064 of 1076 within 1.40 and 1.60.
 */
const COLUMNS = 'columns-2 sm:columns-3 lg:columns-4'

const STATES = [
  { value: '', label: 'All' },
  { value: 'untagged', label: 'Missing gear' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'private', label: 'Private' },
] as const

const SORTS = [
  { value: 'uploaded', label: 'Newest upload' },
  { value: 'taken', label: 'Date taken' },
  { value: 'oldest', label: 'Oldest first' },
] as const

/** Everything that decides which photos are on screen. */
interface Query {
  search: string
  state: string
  cameraId: string
  filmStockId: string
  year: string
  sort: string
}

const EMPTY: Query = { search: '', state: '', cameraId: '', filmStockId: '', year: '', sort: 'uploaded' }

/**
 * Browsing and selecting your own photographs.
 *
 * One surface, used by the photo manager and by the album picker, which had
 * grown as two components with the same job and different answers to it: both
 * re-implemented paging, the caption search, the count and the request-race
 * guard, and they had already drifted apart on the question that matters most.
 * The picker kept every photo it had shown so a selection survived a page turn;
 * the manager threw the selection away on every turn, which made a tool built
 * for bulk editing able to act on only the sixty frames in front of you.
 *
 * Three things this owes the person using it, none of which the old pair gave:
 *
 * A selection that outlives the view. It is held by id and the photos behind it
 * are remembered, so you can gather a roll across four pages and two searches
 * and still see what you have.
 *
 * A way to name a roll. The filters were four booleans and the search matched
 * captions, which 81% of the library does not have — so the one screen built
 * for fixing a roll's camera and film had no way to ask for that roll. Camera,
 * film and year come from what this account actually shot, with counts.
 *
 * Select-all that means all. It asks the server for every id the current view
 * matches rather than the page, because "select all" that quietly meant
 * "select sixty" is what made the whole screen feel like a toy.
 */
export default function PhotoBrowser({
  selected,
  onSelectedChange,
  pinned = [],
  emptyHint,
  showState = true,
  refreshToken = 0,
  onSeen,
  footer,
}: {
  selected: Set<string>
  onSelectedChange: (next: Set<string>) => void
  /**
   * Photos that must stay reachable however the browsing is paged or searched
   * — an album's current members, which the album's own response carries.
   * Without them, deselecting one would depend on it happening to land on the
   * page you are looking at.
   */
  pinned?: BrowserPhoto[]
  emptyHint: string
  /** The manager surfaces draft and visibility; the album picker has no use for them. */
  showState?: boolean
  /**
   * Bumped by the parent when it has changed the photographs underneath.
   *
   * A token rather than a remount: keying this component off a revision threw
   * away the filters, the page and the search along with the stale list, so
   * fixing the film on one roll dropped you back at the top of an unfiltered
   * library and you had to find your place again for the next one.
   */
  refreshToken?: number
  /**
   * Every photo this has put on screen, for a parent that renders its own view
   * of the selection — the album picker's "This album", which has to resolve a
   * member's tile whatever page the browsing happens to be on.
   */
  onSeen?: (seen: Record<string, BrowserPhoto>) => void
  /** Rendered under the grid, given what is selected and what is known about it. */
  footer?: (context: { selected: Set<string>; photoOf: (id: string) => BrowserPhoto | undefined }) => React.ReactNode
}) {
  const { toast } = useToast()
  const fid = useId()

  const [query, setQuery] = useState<Query>(EMPTY)
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  const [photos, setPhotos] = useState<BrowserPhoto[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectingAll, setSelectingAll] = useState(false)

  /**
   * Every photo this browser has put on screen, by id.
   *
   * A selection is a set of ids, and the thing acting on it needs to be able to
   * show what is in it — so a photo chosen on page one still resolves to a tile
   * after four page turns. It only grows.
   */
  const [seen, setSeen] = useState<Record<string, BrowserPhoto>>({})

  const requestId = useRef(0)
  /** The id last clicked, so a shift-click can extend from it after a re-order. */
  const anchor = useRef<string | null>(null)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort: query.sort })
    if (query.search) p.set('search', query.search)
    if (query.state) p.set('filter', query.state)
    if (query.cameraId) p.set('cameraId', query.cameraId)
    if (query.filmStockId) p.set('filmStockId', query.filmStockId)
    if (query.year) p.set('year', query.year)
    return p
  }, [page, query])

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const wantFacets = !facets
      const res = await fetch(`/api/photos/mine?${params}${wantFacets ? '&facets=1' : ''}`)
      if (id !== requestId.current) return
      if (!res.ok) { toast(await apiErrorMessage(res, 'Could not load your photos'), 'error'); return }
      const data = await res.json()
      // Reading the body is another await, so the check is repeated: a page
      // that arrived first but parsed slowly could otherwise overwrite the
      // newer one that had already been applied.
      if (id !== requestId.current) return
      const list: BrowserPhoto[] = Array.isArray(data?.photos) ? data.photos : []
      setPhotos(list)
      setTotal(data?.total ?? 0)
      if (data?.facets) setFacets(data.facets)
      setSeen(prev => {
        const next = { ...prev }
        for (const p of list) next[p.id] = p
        return next
      })
    } catch {
      if (id === requestId.current) toast('Could not reach the server', 'error')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
    // `facets` is read to decide whether to ask for them and must not re-run
    // this when they arrive; everything else that decides the request is in
    // `params`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, toast, refreshToken])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q => (q.search === searchInput ? q : { ...q, search: searchInput }))
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // The pinned photos are resolvable from the first render, before any page has
  // been fetched, so an album's own members always have a tile.
  useEffect(() => {
    if (!pinned.length) return
    setSeen(prev => {
      const next = { ...prev }
      for (const p of pinned) if (!next[p.id]) next[p.id] = p
      return next
    })
  }, [pinned])

  const change = (part: Partial<Query>) => {
    setQuery(q => ({ ...q, ...part }))
    setPage(1)
  }

  const photoOf = useCallback((id: string) => seen[id], [seen])

  // Handed up after the render that set it, rather than during one.
  useEffect(() => { onSeen?.(seen) }, [seen, onSeen])

  const toggle = (index: number, shiftKey: boolean) => {
    const photo = photos[index]
    const next = new Set(selected)

    // Shift extends from the last click, which is how taking a whole roll stops
    // being thirty-six separate ones. Anchored by id rather than by position,
    // so re-sorting or filtering between two clicks cannot make it extend from
    // whatever happens to occupy that slot now.
    const from = anchor.current === null ? -1 : photos.findIndex(p => p.id === anchor.current)
    if (shiftKey && from !== -1) {
      const [a, b] = [from, index].sort((x, y) => x - y)
      const selecting = !selected.has(photo.id)
      for (let i = a; i <= b; i++) {
        if (selecting) next.add(photos[i].id)
        else next.delete(photos[i].id)
      }
    } else if (next.has(photo.id)) {
      next.delete(photo.id)
    } else {
      next.add(photo.id)
    }

    anchor.current = photo.id
    onSelectedChange(next)
  }

  const pageIds = photos.map(p => p.id)
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selected.has(id))

  const togglePage = () => {
    const next = new Set(selected)
    if (allOnPage) pageIds.forEach(id => next.delete(id))
    else pageIds.forEach(id => next.add(id))
    onSelectedChange(next)
  }

  /**
   * Every photo this view matches, not every photo on this page.
   *
   * The server answers with the ids because the browser cannot: the view is
   * paged, and a select-all that could only reach what had already been fetched
   * is the bug this replaces rather than a smaller version of the feature.
   */
  const selectAllMatching = async () => {
    setSelectingAll(true)
    try {
      const res = await fetch(`/api/photos/mine?${params}&idsOnly=1`)
      if (!res.ok) { toast(await apiErrorMessage(res, 'Could not select them all'), 'error'); return }
      const data = await res.json()
      const ids: string[] = Array.isArray(data?.ids) ? data.ids : []
      onSelectedChange(new Set([...selected, ...ids]))
      if (data?.truncated) {
        toast(`Selected the first ${ids.length.toLocaleString()}. Narrow the view to reach the rest.`, 'info')
      }
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setSelectingAll(false)
    }
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const narrowed = Boolean(query.search || query.state || query.cameraId || query.filmStockId || query.year)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="search"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search captions, cameras and films…"
          aria-label="Search your photos"
          className={`${fieldClass} flex-1 min-w-[220px]`}
        />
        <span className="text-xs text-neutral-400 tabular-nums" role="status" aria-live="polite">
          {loading ? 'Loading…' : `${total.toLocaleString()} photo${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* What this account actually shot, with counts. A filter naming gear
          nobody here owns is a filter that can only return nothing. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Picker
          id={`${fid}-camera`}
          label="Camera"
          value={query.cameraId}
          onChange={v => change({ cameraId: v })}
          options={(facets?.cameras ?? []).map(c => ({ value: c.id, label: `${c.name} (${c.count})` }))}
          allLabel="Any camera"
        />
        <Picker
          id={`${fid}-film`}
          label="Film"
          value={query.filmStockId}
          onChange={v => change({ filmStockId: v })}
          options={(facets?.films ?? []).map(f => ({ value: f.id, label: `${f.name} (${f.count})` }))}
          allLabel="Any film"
        />
        <Picker
          id={`${fid}-year`}
          label="Year"
          value={query.year}
          onChange={v => change({ year: v })}
          options={(facets?.years ?? []).map(y => ({ value: String(y.year), label: `${y.year} (${y.count})` }))}
          allLabel="Any year"
        />
        <Picker
          id={`${fid}-sort`}
          label="Sort"
          value={query.sort}
          onChange={v => change({ sort: v })}
          options={SORTS.map(s => ({ value: s.value, label: s.label }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-4">
        {showState && STATES.map(s => (
          <FilterPill key={s.value} pressed={query.state === s.value} onClick={() => change({ state: s.value })}>
            {s.label}
          </FilterPill>
        ))}
        {narrowed && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setQuery({ ...EMPTY, sort: query.sort }); setPage(1) }}
            className={`px-2 py-1 text-xs text-neutral-400 hover:text-white underline ${focusRing}`}
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={togglePage} disabled={photos.length === 0}>
            {allOnPage ? 'Clear page' : 'Select page'}
          </Button>
          {/* Only worth offering once there is more than a page of it. */}
          {total > photos.length && (
            <Button variant="ghost" size="sm" onClick={selectAllMatching} disabled={selectingAll || loading}>
              {selectingAll ? 'Selecting…' : `Select all ${total.toLocaleString()}`}
            </Button>
          )}
        </div>
      </div>

      {!loading && photos.length === 0 && (
        <EmptyState
          message={narrowed ? 'No photos match this view.' : emptyHint}
          action={narrowed ? undefined : { href: '/upload', label: 'Upload your first roll' }}
        />
      )}

      {/* CSS columns rather than the site's measured masonry: that one balances
          column heights because a public wall is a composition, and this is a
          working grid where reading order matters more — shift-click selects a
          run, and a run has to be the run somebody can see. Columns keep the
          photographs in order down each one. */}
      <div className={`${COLUMNS} gap-2`}>
        {photos.map((photo, index) => {
          const isSelected = selected.has(photo.id)
          const shape = photo.width && photo.height ? photo.height / photo.width : 2 / 3
          return (
            <div key={photo.id} className="mb-2 break-inside-avoid group relative">
              <button
                type="button"
                onClick={e => toggle(index, e.shiftKey)}
                aria-pressed={isSelected}
                aria-label={tileLabel(photo, index, showState)}
                className={`relative block w-full bg-neutral-900 overflow-hidden transition-all ${
                  isSelected ? 'ring-2 ring-brand' : 'hover:opacity-80'
                }`}
              >
                <Image
                  src={photo.thumbnailPath}
                  alt={photo.caption ?? ''}
                  width={400}
                  height={Math.round(400 * shape)}
                  className="w-full block"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  {...blurPlaceholder(photo.blurHash, index, PAGE_SIZE)}
                />

                <span
                  className={`absolute top-1.5 left-1.5 w-5 h-5 grid place-items-center border transition-colors ${
                    isSelected ? 'bg-brand border-brand' : 'bg-black/50 border-white/40'
                  }`}
                  aria-hidden
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>

                {showState && (
                  // State a viewer of the public site would never see, surfaced
                  // here because this is the only place it can be acted on.
                  <span className="absolute bottom-1.5 left-1.5 flex flex-wrap items-end gap-1">
                    {photo.published === false && <Badge tone="warningSolid">Draft</Badge>}
                    {photo.visibility === 'PRIVATE' && <Badge>Private</Badge>}
                    {(!photo.cameraId || !photo.filmStockId) && photo.published && <Badge>No gear</Badge>}
                  </span>
                )}
              </button>

              {/* Opening the photograph, in the overlay vocabulary the wall
                  already uses for liking one: drawn on any device without
                  hover, revealed on hover or focus where there is one. It has
                  to be its own control rather than the tile's job, because on
                  a screen whose whole purpose is selecting, a click that
                  navigated away instead would be the wrong answer every time
                  but one. */}
              <Link
                href={`/photos/${photo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${photo.caption?.trim() || `photo ${index + 1}`} in a new tab`}
                className={`absolute top-1 right-1 grid h-9 w-9 place-items-center text-white
                            drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity ${focusRing}
                            opacity-100 [@media(hover:hover)]:opacity-0
                            [@media(hover:hover)]:group-hover:opacity-100
                            [@media(hover:hover)]:group-focus-within:opacity-100`}
              >
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>

              {/* Which gear a frame carries, the thing you came here to fix.
                  Under the photograph rather than across it: the wall's own
                  rule is that nothing covers the picture but the like button,
                  and a caption burned into every frame is what that rule
                  exists to prevent. */}
              {showState && (
                <p className="mt-1 text-[10px] leading-tight text-neutral-400 truncate">
                  {photo.camera?.name ?? 'No camera'} · {photo.filmStock?.name ?? 'No film'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-neutral-400 tabular-nums">Page {page} of {lastPage}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage || loading}>
              Next
            </Button>
          </div>
        </div>
      )}

      {footer?.({ selected, photoOf })}
    </div>
  )
}

/** A labelled select in the site's own field style. */
function Picker({
  id, label, value, onChange, options, allLabel,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  // Hidden when there is nothing to choose between: an account with one camera
  // does not need to be asked which one.
  if (allLabel && options.length < 2) return null
  return (
    <label htmlFor={id} className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${fieldClass} !w-auto !py-1.5 text-xs`}
      >
        {allLabel && <option value="">{allLabel}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

/**
 * What a screen reader hears on a tile.
 *
 * The label replaces the tile's whole subtree, so the badges and the gear
 * caption — draft, private, which camera and film are on the frame, the state
 * you are here to act on — were said nowhere at all: a hundred buttons reading
 * "Select photo 7, not pressed". Said here instead, as a sentence.
 */
function tileLabel(photo: BrowserPhoto, index: number, withState: boolean) {
  const subject = photo.caption?.trim() || `photo ${index + 1}`

  const gear =
    photo.camera && photo.filmStock ? `${photo.camera.name} on ${photo.filmStock.name}`
    : photo.camera ? `${photo.camera.name}, no film recorded`
    : photo.filmStock ? `${photo.filmStock.name}, no camera recorded`
    : 'No camera or film recorded'

  const states: string[] = []
  if (withState && photo.published === false) states.push('draft')
  if (withState && photo.visibility === 'PRIVATE') states.push('private')

  return `Select ${subject}. ${gear}.${states.length ? ` Currently ${states.join(' and ')}.` : ''}`
}
