'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import AddToAlbumDialog from '@/components/AddToAlbumDialog'
import Combobox from '@/components/Combobox'
import EditDetailsDialog, { type RollChoice } from '@/components/EditDetailsDialog'
import ExportSelectionButton from '@/components/ExportSelectionButton'
import FilterDisclosure from '@/components/FilterDisclosure'
import PageShell from '@/components/PageShell'
import SelectionBar, { SELECTION_BAR_ROOM } from '@/components/SelectionBar'
import { useCatalog } from '@/components/useCatalog'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import { toolbarFieldClass } from '@/components/ui/Field'
import FilterPill from '@/components/ui/FilterPill'
import { focusRing } from '@/components/ui/focus'
import OverflowMenu, { type MenuItem } from '@/components/ui/OverflowMenu'
import PageHeader, { sectionHeadingClass } from '@/components/ui/PageHeader'
import SectionError from '@/components/ui/SectionError'
import { ThumbGridSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { inBatches } from '@/lib/batches'
import { fetchJson } from '@/lib/fetchJson'
import type { LibraryPhoto, LibraryRoll } from '@/lib/library/browse'
import { MAX_IDS } from '@/lib/library/requests'
import { RollEditDialog, RollPickerDialog } from './LibraryDialogs'
import LibraryTabs from './LibraryTabs'
import { LibraryGrid, RollSection, type TileHandlers } from './LibraryTiles'
import PhotoViewer from './PhotoViewer'
import { useDragSelect, useSelection } from './useSelection'

interface Option { id: string; name: string }
interface Facets { films: Option[]; cameras: Option[]; labs: Option[]; years: number[]; undated: boolean }
/** One page of the library from /api/library/browse. */
interface BrowsePage { rolls?: LibraryRoll[]; photos?: LibraryPhoto[]; more: boolean; contentSearched?: boolean }
/** What the library's routes answer; each caller reads the field it asked for. */
interface Answer { restored?: number; trashed?: number; updated?: number; rollId?: string | null; keptByRoll?: number; rollsChanged?: number; photoIds?: string[] }
type View = 'rolls' | 'all'
type Section = 'rolls' | 'loose' | 'all'

/** The filters, as the URL keeps them, so a view can be bookmarked and Back undoes a filter. */
const FILTER_KEYS = ['q', 'film', 'camera', 'lab', 'year', 'status', 'missing'] as const
const send = (url: string, body: unknown, method = 'POST') => fetchJson<Answer>(url, { method, body })
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

/**
 * The private library: rolls as contact sheets and the loose photos, or every
 * photo in one grid, narrowed by filters and search that live in the URL. The
 * selection outlasts pages, views and filters, as on Your photos; the bar says
 * how many of it the current filters hide, and every action names the full
 * count it applies to.
 */
export default function LibraryClient({ header }: { header: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { toast } = useToast()
  const view: View = params.get('view') === 'all' ? 'all' : 'rolls'
  const sort = params.get('sort') === 'uploaded' ? 'uploaded' : 'shot'
  const viewing = params.get('photo')
  const filterQuery = useMemo(() => {
    const q = new URLSearchParams()
    for (const key of FILTER_KEYS) { const v = params.get(key); if (v) q.set(key, v) }
    return q.toString()
  }, [params])
  const filtered = filterQuery !== ''

  const [rolls, setRolls] = useState<LibraryRoll[]>([])
  const [loose, setLoose] = useState<LibraryPhoto[]>([])
  const [all, setAll] = useState<LibraryPhoto[]>([])
  const [pages, setPages] = useState<Record<Section, number>>({ rolls: 0, loose: 0, all: 0 })
  const [more, setMore] = useState<Record<Section, boolean>>({ rolls: true, loose: true, all: true })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [contentSearched, setContentSearched] = useState(true)
  const [matching, setMatching] = useState<{ ids: Set<string>; truncated: boolean } | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [catalog] = useCatalog()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [dialog, setDialog] = useState<
    | { kind: 'edit-roll'; rollId: string } | { kind: 'merge'; roll: LibraryRoll } | { kind: 'move' }
    | { kind: 'details' } | { kind: 'album' } | { kind: 'delete-roll'; roll: LibraryRoll } | null
  >(null)
  /** Every photo put on screen, by id, so a selection can be described after its page is gone. */
  const [seen, setSeen] = useState<Map<string, LibraryPhoto>>(new Map())
  const generation = useRef(0)
  const inflight = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // The whole column takes a drag, margins included.
  const grid = useRef<HTMLElement>(null)

  const sections = useMemo<Section[]>(() => (view === 'all' ? ['all'] : ['rolls', 'loose']), [view])
  const order = useMemo(
    () => (view === 'all' ? all.map(p => p.id) : [...rolls.flatMap(r => r.photos.map(p => p.id)), ...loose.map(p => p.id)]),
    [view, all, rolls, loose],
  )
  const { selected, toggle, extendTo, add, remove, clear } = useSelection(order)
  const ids = useMemo(() => [...selected], [selected])
  const n = ids.length
  const hidden = matching && filtered ? ids.filter(id => !matching.ids.has(id)).length : 0
  // A box only ever adds: the selection outlasts the view, so replacing it would drop what is out of sight.
  const box = useDragSelect(grid, useCallback((hit: string[]) => add(hit), [add]))

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [params, pathname, router])
  const clearFilters = () => { setSearch(''); setParams(Object.fromEntries(FILTER_KEYS.map(k => [k, null]))) }

  const remember = useCallback((photos: LibraryPhoto[]) => setSeen(prev => {
    const next = new Map(prev)
    for (const p of photos) next.set(p.id, p)
    return next
  }), [])

  const pageUrl = useCallback((section: Section, page: number) =>
    `/api/library/browse?section=${section}&page=${page}${section === 'all' ? `&sort=${sort}` : ''}${filterQuery ? `&${filterQuery}` : ''}`,
  [filterQuery, sort])

  /** The next page of whichever section is still loading: rolls, then loose photos; or every photo. */
  const loadMore = useCallback(async (reset = false) => {
    const gen = reset ? ++generation.current : generation.current
    const state = reset ? { rolls: 0, loose: 0, all: 0 } : pages
    const status = reset ? { rolls: true, loose: true, all: true } : more
    const section = sections.find(s => status[s])
    if (!section || (inflight.current && !reset)) return
    inflight.current = true
    setLoading(true)
    setLoadError(null)
    try {
      const body = await fetchJson<BrowsePage>(pageUrl(section, state[section]), { fallback: 'Could not load your library' })
      if (gen !== generation.current) return
      setContentSearched(body.contentSearched !== false)
      const photos = section === 'rolls' ? (body.rolls ?? []).flatMap(r => r.photos) : body.photos ?? []
      remember(photos)
      const fresh = <T extends { id: string }>(prev: T[], next: T[]) => (reset ? next : [...prev, ...next.filter(x => !prev.some(p => p.id === x.id))])
      if (section === 'rolls') {
        setRolls(prev => fresh(prev, body.rolls ?? []))
        if (reset) setLoose([])
      } else if (section === 'loose') {
        setLoose(prev => fresh(prev, photos))
      } else {
        setAll(prev => fresh(prev, photos))
      }
      setPages({ ...state, [section]: state[section] + 1 })
      setMore({ ...status, [section]: body.more })
    } catch (error) {
      if (gen === generation.current) setLoadError(error instanceof Error ? error.message : 'Could not load your library')
    } finally {
      if (gen === generation.current) { setLoading(false); inflight.current = false }
    }
  }, [pageUrl, pages, more, sections, remember])

  const loadMatching = useCallback(async () => {
    const body = await fetchJson<{ ids: string[]; truncated: boolean }>(`/api/library/browse?section=ids${filterQuery ? `&${filterQuery}` : ''}`).catch(() => null)
    if (body) setMatching({ ids: new Set(body.ids), truncated: body.truncated })
  }, [filterQuery])
  const loadFacets = useCallback(() => { void fetchJson<Facets>('/api/library/facets').then(setFacets).catch(() => {}) }, [])

  // A new filter, sort or view starts the list again; the selection stays.
  const loadRef = useRef(loadMore)
  loadRef.current = loadMore
  useEffect(() => { void loadRef.current(true) }, [filterQuery, view, sort])
  useEffect(() => { void loadMatching() }, [loadMatching])
  useEffect(() => { loadFacets() }, [loadFacets])

  // The next page loads as the end of the list comes into view.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !loading && sections.some(s => more[s]) && !loadError) void loadMore()
    }, { rootMargin: '800px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading, more, loadError, loadMore, sections])

  // Search waits for a pause in typing.
  useEffect(() => {
    const current = params.get('q') ?? ''
    if (search.trim() === current) return
    const timer = setTimeout(() => setParams({ q: search.trim() || null }), 400)
    return () => clearTimeout(timer)
  }, [search, params, setParams])

  const selectAllMatching = useCallback(() => {
    if (!matching) return
    add([...matching.ids])
    if (matching.truncated) toast(`Selected the first ${matching.ids.size.toLocaleString()}. Narrow the view to reach the rest.`, 'info')
  }, [matching, add, toast])

  // Escape clears the selection; Cmd or Ctrl+A selects everything the view matches.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (viewing || dialog || (event.target as HTMLElement).closest('input, textarea, select, [role="dialog"]')) return
      if (event.key === 'Escape' && n > 0) clear()
      else if ((event.metaKey || event.ctrlKey) && event.key === 'a') { event.preventDefault(); selectAllMatching() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, dialog, n, clear, selectAllMatching])

  /** Reloads what is on screen after a change, keeping how far down it was. */
  const refresh = useCallback(async () => {
    const gen = ++generation.current
    const next: { rolls: LibraryRoll[]; loose: LibraryPhoto[]; all: LibraryPhoto[] } = { rolls: [], loose: [], all: [] }
    const nextMore = { ...more }
    try {
      for (const section of sections) {
        // Loose photos were not on screen yet: they load as the rolls run out.
        if (section === 'loose' && pages.loose === 0) continue
        nextMore[section] = true
        for (let p = 0; p < Math.max(1, pages[section]) && nextMore[section]; p++) {
          const body = await fetchJson<BrowsePage>(pageUrl(section, p), { fallback: 'Could not load your library' })
          if (section === 'rolls') next.rolls.push(...(body.rolls ?? []))
          else next[section].push(...(body.photos ?? []))
          nextMore[section] = body.more
        }
      }
    } catch (error) {
      // What is on screen stays; the change itself was saved.
      if (gen === generation.current) setLoadError(error instanceof Error ? error.message : 'Could not load your library')
      return
    }
    if (gen !== generation.current) return
    remember([...next.rolls.flatMap(r => r.photos), ...next.loose, ...next.all])
    if (view === 'all') setAll(next.all)
    else { setRolls(next.rolls); setLoose(next.loose) }
    setMore(nextMore)
    void loadMatching()
    loadFacets()
  }, [pages, more, sections, pageUrl, view, remember, loadMatching, loadFacets])

  /** Runs a change and reports it; an `undo` gives the toast an Undo. */
  const run = async (work: () => Promise<{ message: string; undo?: () => Promise<void> } | void>) => {
    try {
      const done = await work()
      await refresh()
      if (done) toast(done.message, 'success', done.undo ? { label: 'Undo', onClick: () => void done.undo!().then(refresh) } : undefined)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'That did not work', 'error')
      void refresh()
    }
  }

  const restore = (photoIds: string[]) =>
    inBatches(photoIds, batch => send('/api/library/photos/restore', { ids: batch }), r => r.restored ?? 0, { size: MAX_IDS })
  const trash = (photoIds: string[]) => run(async () => {
    const moved = await inBatches(photoIds, batch => send('/api/library/photos/trash', { ids: batch }), r => r.trashed ?? 0, { size: MAX_IDS })
    remove(photoIds)
    return { message: `Moved ${plural(moved, 'photo')} to the Trash`, undo: async () => { await restore(photoIds) } }
  })
  const setVisibility = (publish: boolean) => run(async () => {
    const changed = await inBatches(ids, batch => send('/api/photos/bulk', { ids: batch, changes: { visibility: publish ? 'PUBLIC' : 'PRIVATE' } }, 'PATCH'), r => r.updated ?? 0)
    return { message: publish ? `Published ${plural(changed, 'photo')}` : `Made ${plural(changed, 'photo')} private` }
  })
  /** Moves the selection; a new roll is made once, by the first batch, and the rest follow it. */
  const moveSelected = async (target: Record<string, unknown>) => {
    let to = target
    await inBatches(ids, async batch => {
      const body = await send('/api/library/photos/move', { ids: batch, ...to })
      if ('newRoll' in to && body.rollId) to = { rollId: body.rollId }
      return body
    }, () => 1, { size: MAX_IDS })
  }
  const applyDetails = async (changes: Record<string, string | null>, rollChoice?: RollChoice) => {
    let rollsChanged = 0
    let keptByRoll = 0
    await run(async () => {
      await inBatches(ids, async batch => {
        const body = await send('/api/library/photos/details', { ids: batch, changes, rolls: rollChoice })
        rollsChanged += body.rollsChanged ?? 0
        keptByRoll += body.keptByRoll ?? 0
        return body
      }, () => 1, { size: MAX_IDS })
      setDialog(null)
      return {
        message: rollsChanged ? `Saved, and ${plural(rollsChanged, 'roll')} changed with them`
          : keptByRoll ? `Saved. ${plural(keptByRoll, 'photo')} kept their roll's film, camera and lab`
          : `Saved ${plural(n, 'photo')}`,
      }
    })
  }

  const selectedRolls = new Set(ids.map(id => seen.get(id)?.rollId).filter(Boolean))
  const onlyRoll = selectedRolls.size === 1 && ids.every(id => seen.get(id)?.rollId) ? [...selectedRolls][0]! : null
  // A selected photo never put on screen may be in a roll, so it counts as one.
  const inRolls = ids.filter(id => seen.get(id)?.rollId !== null).length
  const openPhoto = useCallback((id: string | null) => setParams({ photo: id }), [setParams])
  const onSelect = useCallback((id: string, event: MouseEvent) => { if (event.shiftKey) extendTo(id); else toggle(id) }, [extendTo, toggle])
  const handlers: TileHandlers = { selected, onSelect, onOpen: openPhoto }

  const lessUsed: MenuItem[] = [
    { label: 'Move to roll', onSelect: () => setDialog({ kind: 'move' }) },
    ...(onlyRoll ? [{ label: 'Split into a new roll', onSelect: () => void run(async () => { await moveSelected({ newRoll: { copyFrom: onlyRoll } }); return { message: 'Split into a new roll' } }) }] : []),
    { label: 'Make loose', onSelect: () => void run(async () => { await moveSelected({ loose: true }); return { message: `Made ${plural(n, 'photo')} loose` } }) },
  ]
  const exportable = ids.flatMap(id => {
    const p = seen.get(id)
    return p ? [{ id: p.id, width: p.width, height: p.height, camera: p.camera, filmStock: p.filmStock, takenDate: p.takenDate, caption: p.caption, thumbnailPath: p.src }] : []
  })

  const total = matching?.ids.size ?? null
  const shown = rolls.length + loose.length + all.length
  const nothing = !loading && !loadError && shown === 0
  const emptyLibrary = nothing && !filtered

  /** A filter's choices: the gear in this library, as the catalog draws it. */
  const choices = (list: Option[] | undefined, rows: Option[] | undefined, any: string) =>
    list && list.length > 1 ? [{ id: '', name: any }, ...list.map(f => rows?.find(r => r.id === f.id) ?? f)] : []
  const pickers = [
    { key: 'film', label: 'Film', options: choices(facets?.films, catalog?.films, 'Any film') },
    { key: 'camera', label: 'Camera', options: choices(facets?.cameras, catalog?.cameras, 'Any camera') },
    { key: 'lab', label: 'Lab', options: choices(facets?.labs, catalog?.labs, 'Any lab') },
  ]
  const pill = (key: string, value: string, label: string) => (
    <FilterPill key={`${key}-${value}`} pressed={params.get(key) === value} onClick={() => setParams({ [key]: params.get(key) === value ? null : value })}>{label}</FilterPill>
  )
  const years = facets ? [...facets.years.map(String), ...(facets.undated ? ['undated'] : [])] : []
  const filters = (
    <>
      {pickers.map(p => p.options.length > 0 && (
        <div key={p.key} className="w-full sm:w-[230px]">
          <Combobox label={p.label} hideLabel compact options={p.options} value={params.get(p.key) ?? ''}
            onChange={v => setParams({ [p.key]: v || null })} placeholder={p.options[0].name} />
        </div>
      ))}
      {pill('status', 'published', 'Published')}
      {pill('status', 'private', 'Private')}
      {pill('missing', 'gear', 'Missing gear')}
      {years.length > 1 && years.map(y => pill('year', y, y === 'undated' ? 'Undated' : y))}
      {filtered && (
        <button type="button" onClick={clearFilters} className={`py-1 text-xs text-neutral-500 underline underline-offset-4 hover:text-white ${focusRing}`}>
          Clear all
        </button>
      )}
    </>
  )
  const selectAll = total !== null && total > 0 && (
    <Button variant="ghost" size="sm" className="ml-auto" onClick={selectAllMatching}>Select all {total.toLocaleString()}</Button>
  )

  return (
    <PageShell header={header}>
      <main ref={grid} id="main-content" tabIndex={-1} className={`mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:py-16 ${n > 0 ? SELECTION_BAR_ROOM : ''}`}>
        <PageHeader title="Library" description="Your scans, roll by roll. Everything here is private until you publish it." />
        <LibraryTabs current={view} query={filterQuery} />

        {!emptyLibrary && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search: a cat, a street at night, a place" aria-label="Search your library"
                className={`${toolbarFieldClass()} sm:w-auto sm:min-w-[240px] sm:flex-1`} />
              <span className="text-xs tabular-nums text-neutral-400" role="status" aria-live="polite">
                {total === null ? 'Loading…' : `${total.toLocaleString()}${matching?.truncated ? '+' : ''} ${total === 1 ? 'photo' : 'photos'}`}
              </span>
              {view === 'all' && (
                <label className="w-40">
                  <span className="sr-only">Sort</span>
                  <select value={sort} onChange={e => setParams({ sort: e.target.value === 'uploaded' ? 'uploaded' : null })}
                    className={`${toolbarFieldClass('pl-2 pr-1')} cursor-pointer`}>
                    <option value="shot" className="bg-neutral-900">Date taken</option>
                    <option value="uploaded" className="bg-neutral-900">Newest upload</option>
                  </select>
                </label>
              )}
            </div>
            <div className="mb-5 hidden flex-wrap items-center gap-2 sm:flex">
              {filters}
              {selectAll}
            </div>
            {/* On a phone the filters fold away rather than wrap into rows above the photos. */}
            <div className="sm:hidden">
              <FilterDisclosure applied={FILTER_KEYS.filter(k => k !== 'q' && params.get(k)).length} toolbar={selectAll}>
                <div className="flex flex-wrap items-center gap-2">{filters}</div>
              </FilterDisclosure>
            </div>
            {params.get('q') && !contentSearched && (
              <p className="mb-4 text-sm text-neutral-500">Searching by words only: matching by what photos show is not available right now.</p>
            )}
          </>
        )}

        {loading && shown === 0 && <ThumbGridSkeleton />}
        {emptyLibrary && (
          <EmptyState
            message="Your library is empty"
            hint="Bring in a roll: a folder of scans, a zip from your lab or single files. Everything stays private until you choose to publish it."
            action={{ href: '/library/import', label: 'Upload your first roll' }}
          />
        )}
        {nothing && filtered && (
          <EmptyState message="Nothing in your library matches" hint="Try fewer filters, or another word."
            actions={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>} />
        )}

        <div className="select-none space-y-10">
          {view === 'all' ? (
            all.length > 0 && <LibraryGrid photos={all} handlers={handlers} />
          ) : (
            <>
              {rolls.map(roll => (
                <RollSection key={roll.id} roll={roll} handlers={handlers}
                  actions={{
                    onEdit: r => setDialog({ kind: 'edit-roll', rollId: r.id }),
                    onSelectAll: r => add(r.photos.map(p => p.id)),
                    onMerge: r => setDialog({ kind: 'merge', roll: r }),
                    onDelete: r => setDialog({ kind: 'delete-roll', roll: r }),
                    onSaveOrder: async (r, photoIds) => { await send(`/api/library/rolls/${r.id}/order`, { photoIds }, 'PUT'); await refresh() },
                  }} />
              ))}
              {loose.length > 0 && (
                <section className="border-t border-neutral-800 pt-6">
                  <h2 className={sectionHeadingClass}>Loose photos</h2>
                  <p className="mb-4 text-sm text-neutral-500">Photos in no roll. Each keeps its own details.</p>
                  <LibraryGrid photos={loose} handlers={handlers} />
                </section>
              )}
            </>
          )}
        </div>
        {box && <div aria-hidden className="pointer-events-none fixed z-40 border border-white/80 bg-white/10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}

        <div ref={sentinel} className="h-10" />
        {loading && shown > 0 && <p className="py-6 text-center text-sm text-neutral-500" role="status">Loading more…</p>}
        {loadError && <SectionError className="py-6" message={loadError} onRetry={() => void loadMore(shown === 0)} />}
      </main>

      <SelectionBar count={n} hidden={hidden} onClear={clear}>
        <Button variant="outline" size="sm" onClick={() => void setVisibility(true)}>Publish {n.toLocaleString()}</Button>
        <Button variant="outline" size="sm" onClick={() => void setVisibility(false)}>Make {n.toLocaleString()} private</Button>
        <div className="hidden sm:contents">
          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'album' })}>Add to album</Button>
          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'details' })}>Edit details</Button>
        </div>
        <ExportSelectionButton photos={exportable} selectedCount={n} onExportedBatch={remove} />
        <div className="hidden sm:contents"><OverflowMenu label="More actions" text="More" items={lessUsed} align="right" up /></div>
        <div className="sm:hidden">
          <OverflowMenu label="More actions" text="More" fullWidth align="right" up items={[
            { label: 'Add to album', onSelect: () => setDialog({ kind: 'album' }) },
            { label: 'Edit details', onSelect: () => setDialog({ kind: 'details' }) },
            ...lessUsed,
          ]} />
        </div>
        {/* The fifth action on a phone, so it takes the row rather than half of it. */}
        <Button variant="destructive" size="sm" className="col-span-2 sm:col-span-1" onClick={() => void trash(ids)}>Delete {n.toLocaleString()}</Button>
      </SelectionBar>

      {viewing && (
        <PhotoViewer photoId={viewing} onNavigate={id => setParams({ photo: id })} onClose={() => openPhoto(null)}
          onChanged={() => void refresh()}
          onEditRoll={rollId => setDialog({ kind: 'edit-roll', rollId })}
          onTrash={id => { openPhoto(null); void trash([id]) }} />
      )}
      {dialog?.kind === 'edit-roll' && (
        <RollEditDialog rollId={dialog.rollId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void refresh() }} />
      )}
      {dialog?.kind === 'merge' && (
        <RollPickerDialog title="Merge into which roll?" exclude={dialog.roll.id} onClose={() => setDialog(null)}
          onPick={async target => {
            if (!('rollId' in target)) return
            const from = dialog.roll
            setDialog(null)
            await run(async () => { await send(`/api/library/rolls/${from.id}/merge`, { intoId: target.rollId }); return { message: 'Rolls merged' } })
          }} />
      )}
      {dialog?.kind === 'move' && (
        <RollPickerDialog title={`Move ${plural(n, 'photo')} to which roll?`} allowNew onClose={() => setDialog(null)}
          onPick={async target => {
            setDialog(null)
            await run(async () => { await moveSelected(target); return { message: `Moved ${plural(n, 'photo')}` } })
          }} />
      )}
      <EditDetailsDialog open={dialog?.kind === 'details'} count={n} inRolls={inRolls} fields={['film', 'camera', 'lab', 'date', 'caption']}
        onApply={applyDetails} onClose={() => setDialog(null)} />
      <AddToAlbumDialog open={dialog?.kind === 'album'} onClose={() => setDialog(null)} photoIds={ids}
        onAdded={name => { setDialog(null); toast(`Added ${plural(n, 'photo')} to ${name}`, 'success') }} />
      <ConfirmDialog open={dialog?.kind === 'delete-roll'} title="Delete this roll?" confirmLabel="Move to Trash"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== 'delete-roll') return
          const roll = dialog.roll
          setDialog(null)
          await run(async () => {
            const body = await send(`/api/library/rolls/${roll.id}/trash`, {})
            return { message: 'Roll moved to the Trash', undo: async () => { await restore(body.photoIds ?? []) } }
          })
        }}>
        Its photos go to the Trash for 30 days. Restoring them puts them back in this roll.
      </ConfirmDialog>
    </PageShell>
  )
}
