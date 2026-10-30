'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { blurPlaceholder } from '@/lib/blurhash'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import FilterPill from '@/components/ui/FilterPill'
import { toolbarFieldClass } from '@/components/ui/Field'
import { focusRing } from '@/components/ui/focus'
import Combobox from '@/components/Combobox'
import SelectableTile, { TILE_GRID, tileCornerClass } from '@/components/SelectableTile'
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
  uploadComplete?: boolean
  visibility?: 'PUBLIC' | 'PRIVATE'
  /** The automatic nudity check (vision/worker.ts). Anything but CLEAR is hidden from everyone else. */
  screening?: 'PENDING' | 'CLEAR' | 'HELD' | 'REJECTED'
  takenDate?: string | null
  cameraId?: string | null
  filmStockId?: string | null
  camera?: { name: string; brand?: string | null } | null
  filmStock?: { name: string; brand?: string | null } | null
}

type Facet = { id: string; name: string; count: number }
type Facets = { cameras: Facet[]; films: Facet[]; years: { year: number; count: number }[] }

/**
 * A catalog row as the shared picker wants it, pictures and aliases included.
 *
 * The facets say which camera and film this account has actually shot; the
 * catalog says what each one looks like. Both are needed: a filter should offer
 * only gear somebody owns, and it should look like every other place on the
 * site where gear is chosen rather than like a browser's own dropdown.
 */
type GearOption = {
  id: string
  name: string
  brand?: string | null
  manufacturer?: string | null
  imageUrl?: string | null
  aliases?: string[]
}

/** The row that puts a filter back to "everything". Combobox cannot clear itself. */
const anyOf = (label: string): GearOption => ({ id: '', name: label })

const PAGE_SIZE = 60

/**
 * Three, and each one toggles.
 *
 * There was a fourth called All, which is the absence of the other three — a
 * control for having chosen nothing, next to a Clear link that also meant
 * having chosen nothing. Nothing lit is all of them; pressing a lit one puts it
 * back.
 */
const STATES = [
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

  const [query, setQuery] = useState<Query>(EMPTY)
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  const [photos, setPhotos] = useState<BrowserPhoto[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [catalog, setCatalog] = useState<{ cameras: GearOption[]; films: GearOption[] }>({ cameras: [], films: [] })
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

  // The same two lists the bulk editor below fills its pickers from, so the
  // filter and the field that changes it show the same thing.
  useEffect(() => {
    fetch('/api/cameras').then(r => r.json()).then(d => Array.isArray(d) && setCatalog(c => ({ ...c, cameras: d }))).catch(() => {})
    fetch('/api/filmstocks').then(r => r.json()).then(d => Array.isArray(d) && setCatalog(c => ({ ...c, films: d }))).catch(() => {})
  }, [])

  /** Only gear this account has, described the way the catalog describes it. */
  const owned = useMemo(() => {
    const pick = (facet: Facet[], rows: GearOption[], anyLabel: string) => {
      const options = facet.flatMap(f => {
        const found = rows.find(r => r.id === f.id)
        return found ? [found] : []
      })
      return options.length > 1 ? [anyOf(anyLabel), ...options] : []
    }
    return {
      cameras: pick(facets?.cameras ?? [], catalog.cameras, 'Any camera'),
      films: pick(facets?.films ?? [], catalog.films, 'Any film'),
    }
  }, [facets, catalog])

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
      {/* Two rows.
          This was a bordered panel of search and pickers over a strip of count,
          sort and two select buttons — and before that, nine chips in a line.
          Three things turned out to be redundant rather than misplaced: an All
          pill, which is the absence of the other three beside a Clear link that
          also means that; Select page, which shift-click and Select all already
          cover between them; and a box drawn around controls that nothing else
          on the site draws a box around. */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="search"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search your photos"
          aria-label="Search your photos by caption, camera or film"
          // Full width on a phone, with the count and sort on the next line:
          // beside them, the placeholder was cut off mid-word.
          className={`${toolbarFieldClass()} sm:w-auto sm:flex-1 sm:min-w-[240px]`}
        />
        <span className="text-xs text-neutral-400 tabular-nums" role="status" aria-live="polite">
          {loading ? 'Loading…' : `${total.toLocaleString()} photo${total === 1 ? '' : 's'}`}
        </span>
        {/* A bordered select at the row's height. It was bare 12px text, which
            iOS zooms the page into on focus and nobody read as a control. */}
        <label className="w-40">
          <span className="sr-only">Sort</span>
          <select
            value={query.sort}
            onChange={e => change({ sort: e.target.value })}
            className={`${toolbarFieldClass('pl-2 pr-1')} cursor-pointer`}
          >
            {SORTS.map(s => <option key={s.value} value={s.value} className="bg-neutral-900">{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {owned.cameras.length > 0 && (
          <div className="w-[230px]">
            <Combobox
              label="Camera"
              hideLabel
              compact
              options={owned.cameras}
              value={query.cameraId}
              onChange={v => change({ cameraId: v })}
              placeholder="Any camera"
            />
          </div>
        )}
        {owned.films.length > 0 && (
          <div className="w-[230px]">
            <Combobox
              label="Film"
              hideLabel
              compact
              options={owned.films}
              value={query.filmStockId}
              onChange={v => change({ filmStockId: v })}
              placeholder="Any film"
            />
          </div>
        )}

        {showState && STATES.map(s => (
          <FilterPill
            key={s.value}
            pressed={query.state === s.value}
            onClick={() => change({ state: query.state === s.value ? '' : s.value })}
          >
            {s.label}
          </FilterPill>
        ))}

        {(facets?.years.length ?? 0) > 1 && (facets?.years ?? []).map(y => (
          <FilterPill
            key={y.year}
            pressed={query.year === String(y.year)}
            onClick={() => change({ year: query.year === String(y.year) ? '' : String(y.year) })}
          >
            {y.year}
          </FilterPill>
        ))}

        {narrowed && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setQuery({ ...EMPTY, sort: query.sort }); setPage(1) }}
            className={`py-1 text-xs text-neutral-500 underline underline-offset-4 hover:text-white ${focusRing}`}
          >
            Clear all
          </button>
        )}

        {/* The only selection control that has to exist before a selection
            does. Shift-click takes a run and the tiles take one at a time; what
            neither can reach is everything the filters just found. */}
        {photos.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={selectAllMatching}
            disabled={selectingAll || loading}
          >
            {selectingAll ? 'Selecting…' : `Select all ${total.toLocaleString()}`}
          </Button>
        )}
      </div>

      {!loading && photos.length === 0 && (
        <EmptyState
          message={narrowed ? 'No photos match this filter' : emptyHint}
          action={narrowed ? undefined : { href: '/upload', label: 'Upload your first roll' }}
        />
      )}

      <div className={TILE_GRID}>
        {photos.map((photo, index) => (
          <SelectableTile
            key={photo.id}
            selected={selected.has(photo.id)}
            onSelect={e => toggle(index, e.shiftKey)}
            label={tileLabel(photo, index, showState)}
            // Contained rather than cropped. Filling the square would take a
            // third off every frame, and the whole frame is what somebody is
            // identifying when they pick one.
            image={
              <Image unoptimized
                src={photo.thumbnailPath}
                alt={photo.caption ?? ''}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1280px) 17vw, 200px"
                {...blurPlaceholder(photo.blurHash, index, PAGE_SIZE)}
              />
            }
            // State a viewer of the public site would never see, surfaced here
            // because this is the only place it can be acted on.
            badges={showState && (photo.uploadComplete === false || photo.visibility === 'PRIVATE' || (photo.screening && photo.screening !== 'CLEAR')) ? (
              <>
                {photo.uploadComplete === false && <Badge tone="warningSolid">Draft</Badge>}
                {photo.visibility === 'PRIVATE' && <Badge>Private</Badge>}
                {photo.screening === 'PENDING' && <Badge>Checking</Badge>}
                {photo.screening === 'HELD' && <Badge tone="warningSolid">Held for review</Badge>}
                {photo.screening === 'REJECTED' && <Badge tone="warningSolid">Hidden</Badge>}
              </>
            ) : undefined}
            // Its own control rather than the tile's job: on a screen whose
            // whole purpose is selecting, a click that navigated away would be
            // the wrong answer every time but one.
            corner={
              <Link
                href={`/photos/${photo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${photo.caption?.trim() || `photo ${index + 1}`} in a new tab`}
                className={tileCornerClass}
              >
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>
            }
            // Only where it tells you something: the frames missing a piece,
            // which is what this screen is for.
            below={showState && (!photo.cameraId || !photo.filmStockId) && (
              <p className="mt-1 text-[10px] leading-tight text-amber-300/80 truncate">
                {!photo.cameraId && !photo.filmStockId
                  ? 'No camera or film'
                  : !photo.cameraId ? 'No camera' : 'No film'}
              </p>
            )}
          />
        ))}
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
  if (withState && photo.uploadComplete === false) states.push('draft')
  if (withState && photo.visibility === 'PRIVATE') states.push('private')
  if (withState && photo.screening === 'HELD') states.push('held for review')
  if (withState && photo.screening === 'REJECTED') states.push('hidden by an admin')

  return `Select ${subject}. ${gear}.${states.length ? ` Currently ${states.join(' and ')}.` : ''}`
}
