'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import AddToAlbumDialog from '@/components/AddToAlbumDialog'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { FieldInput, toolbarFieldClass } from '@/components/ui/Field'
import { pageTitleClass } from '@/components/ui/PageHeader'
import { apiErrorMessage } from '@/lib/apiError'
import type { LibraryPhoto, LibraryRoll } from '@/lib/library/browse'
import { BulkDetailsDialog, RollEditDialog, RollPickerDialog, UndoBar } from './LibraryDialogs'
import { PhotoTile, RollSection } from './LibraryTiles'
import PhotoViewer from './PhotoViewer'
import { useDragSelect, useSelection } from './useSelection'

interface Facets { films: { id: string; name: string }[]; cameras: { id: string; name: string }[]; labs: { id: string; name: string }[]; years: number[]; undated: boolean }
interface Undo { message: string; undo?: () => Promise<void> }

const FILTER_KEYS = ['q', 'film', 'camera', 'lab', 'year', 'status'] as const

async function postJson(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await apiErrorMessage(res, 'That did not work'))
  return res.json().catch(() => ({}))
}

/**
 * The private library: every roll as a contact sheet, newest first, then the
 * loose photos. Filters and search live in the URL, so a filtered view can be
 * bookmarked and the back button undoes a filter.
 */
export default function LibraryClient() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filterQuery = useMemo(() => {
    const q = new URLSearchParams()
    for (const key of FILTER_KEYS) { const v = params.get(key); if (v) q.set(key, v) }
    return q.toString()
  }, [params])
  const viewing = params.get('photo')

  const [rolls, setRolls] = useState<LibraryRoll[]>([])
  const [loose, setLoose] = useState<LibraryPhoto[]>([])
  const [pages, setPages] = useState({ rolls: 0, loose: 0 })
  const [more, setMore] = useState({ rolls: true, loose: true })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [contentSearched, setContentSearched] = useState(true)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [dialog, setDialog] = useState<
    | { kind: 'edit-roll'; rollId: string } | { kind: 'merge'; roll: LibraryRoll } | { kind: 'move' }
    | { kind: 'details' } | { kind: 'album' } | { kind: 'delete-roll'; roll: LibraryRoll } | null
  >(null)
  const [undo, setUndo] = useState<Undo | null>(null)
  const generation = useRef(0)
  const inflight = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // The whole column takes a drag, margins included: people start a box beside
  // the grid as often as inside it.
  const grid = useRef<HTMLElement>(null)

  // Every photo shown, in order, for shift-click ranges.
  const order = useMemo(() => [...rolls.flatMap(r => r.photos.map(p => p.id)), ...loose.map(p => p.id)], [rolls, loose])
  const { selected, toggle, extendTo, add, clear } = useSelection(order)
  const selecting = selected.size > 0
  const box = useDragSelect(grid, useCallback((ids: string[], additive: boolean) => add(ids, !additive), [add]))

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [params, pathname, router])

  /** Loads the next page: rolls first, then loose photos once rolls run out. */
  const loadMore = useCallback(async (reset = false) => {
    const gen = reset ? ++generation.current : generation.current
    const state = reset ? { rolls: 0, loose: 0 } : pages
    const status = reset ? { rolls: true, loose: true } : more
    const section = status.rolls ? 'rolls' : status.loose ? 'loose' : null
    if (!section || (inflight.current && !reset)) return
    inflight.current = true
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/library/browse?section=${section}&page=${state[section]}&${filterQuery}`)
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not load your library'))
      const body = await res.json()
      if (gen !== generation.current) return
      setContentSearched(body.contentSearched !== false)
      // A page never adds what is already shown.
      if (section === 'rolls') {
        setRolls(prev => (reset ? body.rolls : [...prev, ...(body.rolls as LibraryRoll[]).filter(r => !prev.some(p => p.id === r.id))]))
        if (reset) setLoose([])
      } else {
        setLoose(prev => (reset ? body.photos : [...prev, ...(body.photos as LibraryPhoto[]).filter(p => !prev.some(q => q.id === p.id))]))
      }
      setPages({ ...state, [section]: state[section] + 1 })
      setMore({ ...status, [section]: body.more })
    } catch (error) {
      if (gen === generation.current) setLoadError(error instanceof Error ? error.message : 'Could not load your library')
    } finally {
      if (gen === generation.current) { setLoading(false); inflight.current = false }
    }
  }, [filterQuery, pages, more])

  // A new filter starts the list again.
  const loadRef = useRef(loadMore)
  loadRef.current = loadMore
  useEffect(() => { void loadRef.current(true) }, [filterQuery])
  useEffect(() => {
    void fetch('/api/library/facets').then(r => (r.ok ? r.json() : null)).then(f => f && setFacets(f))
  }, [])

  // The next page loads as the end of the list comes into view.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !loading && (more.rolls || more.loose) && !loadError) void loadMore()
    }, { rootMargin: '800px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading, more, loadError, loadMore])

  // Search waits for a pause in typing.
  useEffect(() => {
    const current = params.get('q') ?? ''
    if (search.trim() === current) return
    const timer = setTimeout(() => setParams({ q: search.trim() || null }), 400)
    return () => clearTimeout(timer)
  }, [search, params, setParams])

  // Escape clears the selection; Cmd or Ctrl+A selects everything loaded.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (viewing || dialog || (event.target as HTMLElement).closest('input, textarea, select')) return
      if (event.key === 'Escape' && selecting) clear()
      else if ((event.metaKey || event.ctrlKey) && event.key === 'a') { event.preventDefault(); add(order, true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, dialog, selecting, clear, add, order])

  /** Reloads what is on screen after a change, keeping how far down it was. */
  const refresh = useCallback(async () => {
    const gen = ++generation.current
    const rollPages = Math.max(1, pages.rolls)
    const loosePages = pages.loose
    const nextRolls: LibraryRoll[] = []
    const nextLoose: LibraryPhoto[] = []
    let moreRolls = true, moreLoose = true
    for (let p = 0; p < rollPages && moreRolls; p++) {
      const body = await (await fetch(`/api/library/browse?section=rolls&page=${p}&${filterQuery}`)).json()
      nextRolls.push(...body.rolls); moreRolls = body.more
    }
    for (let p = 0; p < loosePages && moreLoose; p++) {
      const body = await (await fetch(`/api/library/browse?section=loose&page=${p}&${filterQuery}`)).json()
      nextLoose.push(...body.photos); moreLoose = body.more
    }
    if (gen !== generation.current) return
    setRolls(nextRolls); setLoose(nextLoose)
    setMore({ rolls: moreRolls, loose: loosePages ? moreLoose : true })
    void fetch('/api/library/facets').then(r => (r.ok ? r.json() : null)).then(f => f && setFacets(f))
  }, [pages, filterQuery])

  const run = async (work: () => Promise<Undo | void>) => {
    try {
      const done = await work()
      if (done) setUndo(done)
      await refresh()
    } catch (error) {
      setUndo({ message: error instanceof Error ? error.message : 'That did not work' })
    }
  }

  const ids = [...selected]
  const selectedRolls = new Set(rolls.filter(r => r.photos.some(p => selected.has(p.id))).map(r => r.id))
  const onlyRoll = selectedRolls.size === 1 && !loose.some(p => selected.has(p.id)) ? [...selectedRolls][0] : null

  const trash = (photoIds: string[], label: string) => run(async () => {
    await postJson('/api/library/photos/trash', { ids: photoIds })
    clear()
    return { message: label, undo: async () => { await postJson('/api/library/photos/restore', { ids: photoIds }); await refresh() } }
  })
  const setVisibility = (publish: boolean) => run(async () => {
    await postJson('/api/photos/bulk', { ids, changes: { visibility: publish ? 'PUBLIC' : 'PRIVATE' } }, 'PATCH')
    clear()
    return { message: publish ? `Published ${ids.length}` : `Made ${ids.length} private` }
  })
  const openPhoto = useCallback((id: string | null) => setParams({ photo: id }), [setParams])
  const activeFilters = FILTER_KEYS.some(k => params.get(k))
  const empty = !loading && !loadError && rolls.length === 0 && loose.length === 0 && !more.rolls && !more.loose

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <main ref={grid} id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className={pageTitleClass}>Library</h1>
          <div className="flex flex-wrap gap-2">
            <Link href="/library/import" className="inline-flex h-10 items-center bg-brand px-5 text-sm font-medium text-white hover:bg-brand-dark">Import</Link>
            <Link href="/albums" className="inline-flex h-10 items-center border border-neutral-700 px-5 text-sm text-white hover:border-neutral-500">Albums</Link>
            <Link href="/library/trash" className="inline-flex h-10 items-center border border-neutral-700 px-5 text-sm text-white hover:border-neutral-500">Trash</Link>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2" role="search">
          <FieldInput aria-label="Search your library" placeholder="Search: a cat, street at night, a place…" value={search}
            onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 basis-60" />
          {facets && (
            <>
              <FilterSelect label="Film stock" value={params.get('film')} options={facets.films.map(f => [f.id, f.name])} onChange={v => setParams({ film: v })} />
              <FilterSelect label="Camera" value={params.get('camera')} options={facets.cameras.map(c => [c.id, c.name])} onChange={v => setParams({ camera: v })} />
              <FilterSelect label="Lab" value={params.get('lab')} options={facets.labs.map(l => [l.id, l.name])} onChange={v => setParams({ lab: v })} />
              <FilterSelect label="Year shot" value={params.get('year')} options={[...facets.years.map(y => [String(y), String(y)] as [string, string]), ...(facets.undated ? [['undated', 'Undated'] as [string, string]] : [])]} onChange={v => setParams({ year: v })} />
            </>
          )}
          <FilterSelect label="Published or private" value={params.get('status')} options={[['published', 'Published'], ['private', 'Private']]} onChange={v => setParams({ status: v })} />
          {activeFilters && <Button variant="ghost" size="sm" className="h-10" onClick={() => { setSearch(''); setParams(Object.fromEntries(FILTER_KEYS.map(k => [k, null]))) }}>Clear</Button>}
        </div>
        {params.get('q') && !contentSearched && (
          <p className="mb-4 text-sm text-neutral-400">Searching by words only: matching by what photos show is not available right now.</p>
        )}

        <div className="space-y-8 select-none">
          {rolls.map(roll => (
            <RollSection key={roll.id} roll={roll} selected={selected} selecting={selecting}
              onOpen={openPhoto} onToggle={toggle} onExtend={extendTo}
              actions={{
                onEdit: r => setDialog({ kind: 'edit-roll', rollId: r.id }),
                onSelectAll: r => add(r.photos.map(p => p.id)),
                onMerge: r => setDialog({ kind: 'merge', roll: r }),
                onDelete: r => setDialog({ kind: 'delete-roll', roll: r }),
                onSaveOrder: async (r, photoIds) => { await postJson(`/api/library/rolls/${r.id}/order`, { photoIds }, 'PUT'); await refresh() },
              }} />
          ))}
          {loose.length > 0 && (
            <section className="border-t border-neutral-800 pt-4">
              <h2 className="text-base font-bold text-white">Loose photos</h2>
              <p className="mb-3 text-xs text-neutral-500">Photos in no roll. Each holds its own details.</p>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-9">
                {loose.map(photo => (
                  <li key={photo.id}>
                    <PhotoTile photo={photo} selected={selected.has(photo.id)} selecting={selecting}
                      onOpen={openPhoto} onToggle={toggle} onExtend={extendTo} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {box && <div aria-hidden className="pointer-events-none fixed z-40 border border-white/80 bg-white/10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}

        <div ref={sentinel} className="h-10" />
        {loading && <p className="py-6 text-center text-sm text-neutral-500">Loading…</p>}
        {loadError && (
          <p className="py-6 text-center text-sm text-brand">{loadError} <button type="button" className="underline" onClick={() => void loadMore()}>Try again</button></p>
        )}
        {empty && (
          <div className="py-16 text-center">
            <p className="text-neutral-300">{activeFilters ? 'Nothing in your library matches.' : 'Your library is empty.'}</p>
            {!activeFilters && <Link href="/library/import" className="mt-2 inline-block text-sm text-white underline">Import a delivery</Link>}
          </div>
        )}
        {/* Room for the selection bar. */}
        {selecting && <div className="h-24" />}
      </main>
      <Footer />

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-[#0a0a0a]/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
            <span className="mr-2 text-sm text-white">{selected.size} selected</span>
            <Button size="sm" onClick={() => setVisibility(true)}>Publish</Button>
            <Button size="sm" variant="outline" onClick={() => setVisibility(false)}>Make private</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'album' })}>Add to album</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'details' })}>Edit details</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'move' })}>Move to roll</Button>
            {onlyRoll && (
              <Button size="sm" variant="outline" onClick={() => run(async () => {
                await postJson('/api/library/photos/move', { ids, newRoll: { copyFrom: onlyRoll } }); clear()
                return { message: 'Split into a new roll' }
              })}>Split into new roll</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => run(async () => {
              await postJson('/api/library/photos/move', { ids, loose: true }); clear()
              return { message: `Made ${ids.length} loose` }
            })}>Make loose</Button>
            <Button size="sm" variant="destructive" onClick={() => trash(ids, `Moved ${ids.length} to the Trash`)}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={clear}>Cancel</Button>
          </div>
        </div>
      )}

      {viewing && (
        <PhotoViewer photoId={viewing} onNavigate={id => setParams({ photo: id })} onClose={() => openPhoto(null)}
          onChanged={() => void refresh()}
          onEditRoll={rollId => setDialog({ kind: 'edit-roll', rollId })}
          onTrash={id => { openPhoto(null); void trash([id], 'Moved to the Trash') }} />
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
            await run(async () => { await postJson(`/api/library/rolls/${from.id}/merge`, { intoId: target.rollId }); return { message: 'Rolls merged' } })
          }} />
      )}
      {dialog?.kind === 'move' && (
        <RollPickerDialog title={`Move ${ids.length} to which roll?`} allowNew onClose={() => setDialog(null)}
          onPick={async target => {
            setDialog(null)
            await run(async () => {
              await postJson('/api/library/photos/move', { ids, ...target }); clear()
              return { message: 'Moved' }
            })
          }} />
      )}
      {dialog?.kind === 'details' && (
        <BulkDetailsDialog count={ids.length} onClose={() => { setDialog(null); void refresh() }}
          onApply={async changes => {
            try { return await postJson('/api/library/photos/details', { ids, changes }) } catch (error) {
              return { error: error instanceof Error ? error.message : 'Could not save' }
            }
          }} />
      )}
      <AddToAlbumDialog open={dialog?.kind === 'album'} onClose={() => setDialog(null)} photoIds={ids}
        onAdded={name => { setDialog(null); clear(); setUndo({ message: `Added to ${name}` }) }} />
      <ConfirmDialog open={dialog?.kind === 'delete-roll'} title="Delete this roll?" confirmLabel="Delete"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== 'delete-roll') return
          const roll = dialog.roll
          setDialog(null)
          await run(async () => {
            const body = await postJson(`/api/library/rolls/${roll.id}/trash`, {})
            return { message: 'Roll moved to the Trash', undo: async () => { await postJson('/api/library/photos/restore', { ids: body.photoIds }); await refresh() } }
          })
        }}>
        Its photos go to the Trash for 30 days. Restoring them puts them back in this roll.
      </ConfirmDialog>
      {undo && <UndoBar message={undo.message} onUndo={undo.undo ? () => void undo.undo!() : undefined} onDismiss={() => setUndo(null)} />}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string | null
  options: [string, string][]
  onChange: (value: string | null) => void
}) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || null)}
      className={`${toolbarFieldClass} w-auto max-w-[12rem]`}>
      <option value="">{label}</option>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  )
}
