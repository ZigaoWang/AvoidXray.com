'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { focusRing } from '@/components/ui/focus'
import Image from 'next/image'
import Combobox from '@/components/Combobox'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { fieldClass } from '@/components/ui/Field'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/components/ui/Toast'
import type { FilmStockOption } from '@/lib/filmSearch'
import EmptyState from '@/components/ui/EmptyState'

interface Photo {
  id: string
  thumbnailPath: string
  caption: string | null
  published: boolean
  visibility: 'PUBLIC' | 'PRIVATE'
  takenDate: string | null
  createdAt: string
  cameraId: string | null
  filmStockId: string | null
  camera: { name: string } | null
  filmStock: { name: string } | null
}

type Camera = { id: string; name: string; brand: string | null }

const PAGE_SIZE = 60

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'untagged', label: 'Missing gear' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'private', label: 'Private' },
] as const

/**
 * Bulk editing for your own photos.
 *
 * A roll is thirty-six frames sharing a camera, a film stock and a date. Fixing
 * one wrong choice meant opening each photo's edit page in turn, so the work
 * scaled with the mistake. Everything here operates on a selection, and only
 * the fields you actually fill in are sent — so setting the film on forty
 * photos does not also blank their captions.
 */
export default function ManagePhotos() {
  const { toast } = useToast()

  const [photos, setPhotos] = useState<Photo[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /** Whether the bulk fields are unfolded. Only consulted below sm. */
  const [editingFields, setEditingFields] = useState(false)

  const [cameras, setCameras] = useState<Camera[]>([])
  const [films, setFilms] = useState<FilmStockOption[]>([])

  // Pending bulk values. Empty means "leave this field alone".
  const [newCamera, setNewCamera] = useState('')
  const [newFilm, setNewFilm] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newVisibility, setNewVisibility] = useState('')

  // Anchor for shift-click range selection.
  const lastClicked = useRef<number | null>(null)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(PAGE_SIZE), search,
        ...(filter ? { filter } : {}),
      })
      const res = await fetch(`/api/photos/mine?${params}`)
      if (id !== requestId.current) return
      if (!res.ok) { toast(await apiErrorMessage(res, 'Could not load your photos'), 'error'); return }
      const data = await res.json()
      // Reading the body is another await, so the check is repeated: a page
      // that arrived first but parsed slowly could otherwise overwrite the
      // newer one that had already been applied.
      if (id !== requestId.current) return
      setPhotos(data.photos ?? [])
      setTotal(data.total ?? 0)
    } catch {
      if (id === requestId.current) toast('Could not reach the server', 'error')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [page, search, filter, toast])

  useEffect(() => { load() }, [load])

  /**
   * The selection belongs to the photos on screen.
   *
   * It survived a page change, a filter change and a search, so selecting
   * twenty frames on page one and turning to page two left a bar reading
   * "20 selected" above sixty photos none of which looked selected, with a
   * Delete button that meant it. Applying a film stock had the same reach.
   *
   * `lastClicked` goes with it: it stores an index into `photos`, so after the
   * list changes underneath it, a shift-click extended the range from whatever
   * happened to occupy that position.
   */
  useEffect(() => {
    setSelected(new Set())
    lastClicked.current = null
  }, [page, filter, search])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    fetch('/api/cameras').then(r => r.json()).then(d => setCameras(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/filmstocks').then(r => r.json()).then(d => setFilms(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const toggle = (index: number, shiftKey: boolean) => {
    const photo = photos[index]
    setSelected(prev => {
      const next = new Set(prev)
      // Shift extends from the last click, which is how selecting a whole roll
      // stops being thirty-six separate clicks.
      if (shiftKey && lastClicked.current !== null) {
        const [from, to] = [lastClicked.current, index].sort((a, b) => a - b)
        const selecting = !prev.has(photo.id)
        for (let i = from; i <= to; i++) {
          if (selecting) next.add(photos[i].id)
          else next.delete(photos[i].id)
        }
      } else if (next.has(photo.id)) {
        next.delete(photo.id)
      } else {
        next.add(photo.id)
      }
      return next
    })
    lastClicked.current = index
  }

  const allOnPageSelected = photos.length > 0 && photos.every(p => selected.has(p.id))
  const toggleAllOnPage = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) photos.forEach(p => next.delete(p.id))
      else photos.forEach(p => next.add(p.id))
      return next
    })
  }

  const pendingChanges = () => {
    const changes: Record<string, unknown> = {}
    if (newCamera) changes.cameraId = newCamera
    if (newFilm) changes.filmStockId = newFilm
    if (newDate) changes.takenDate = newDate
    if (newVisibility) changes.visibility = newVisibility
    return changes
  }

  const changeCount = Object.keys(pendingChanges()).length

  const apply = async () => {
    const changes = pendingChanges()
    if (selected.size === 0 || Object.keys(changes).length === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/photos/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], changes }),
      })
      if (!res.ok) { toast(await apiErrorMessage(res, 'Could not apply the changes'), 'error'); return }
      const data = await res.json()
      toast(`Updated ${data.updated} photo${data.updated === 1 ? '' : 's'}`, 'success')
      setNewCamera(''); setNewFilm(''); setNewDate(''); setNewVisibility('')
      setSelected(new Set())
      await load()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  // No busy flag of its own: the dialog owns that while onConfirm is in flight,
  // and the editing bar behind it cannot be reached anyway.
  const removeSelected = async () => {
    try {
      const res = await fetch('/api/photos/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      })
      if (!res.ok) { toast(await apiErrorMessage(res, 'Could not delete'), 'error'); return }
      const data = await res.json()
      toast(`Deleted ${data.deleted} photo${data.deleted === 1 ? '' : 's'}`, 'success')
      setSelected(new Set())
      setConfirmingDelete(false)
      await load()
    } catch {
      toast('Could not reach the server', 'error')
    }
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="pb-24 sm:pb-32">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search your captions…"
          aria-label="Search your photos"
          className="flex-1 min-w-[200px] bg-neutral-900 border border-neutral-800 px-3 py-2 text-base sm:text-sm text-white
                     placeholder:text-neutral-600 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <span className="text-xs text-neutral-500 tabular-nums">
          {loading ? 'Loading…' : `${total.toLocaleString()} photo${total === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setPage(1) }}
            className={`px-3 py-1.5 text-xs uppercase tracking-wide font-medium transition-colors ${
              filter === f.value ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={toggleAllOnPage}
          disabled={photos.length === 0}
          className="ml-auto px-3 py-1.5 text-xs uppercase tracking-wide font-medium text-neutral-400
                     hover:text-white disabled:opacity-30"
        >
          {allOnPageSelected ? 'Clear page' : 'Select page'}
        </button>
      </div>

      {!loading && photos.length === 0 && (
        <EmptyState
          message={search || filter ? 'No photos match this view.' : 'You have not uploaded any photos yet.'}
          action={search || filter ? undefined : { href: '/upload', label: 'Upload your first roll' }}
        />
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {photos.map((photo, index) => {
          const isSelected = selected.has(photo.id)
          return (
            <button
              key={photo.id}
              onClick={e => toggle(index, e.shiftKey)}
              aria-pressed={isSelected}
              aria-label={tileLabel(photo, index)}
              className={`relative aspect-square bg-neutral-900 overflow-hidden group transition-all ${
                isSelected ? 'ring-2 ring-brand' : 'hover:opacity-80'
              }`}
            >
              <Image src={photo.thumbnailPath} alt={photo.caption ?? ''} fill sizes="200px" className="object-cover" />

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

              {/* State a viewer of the public site would never see, surfaced
                  here because this is the only place it can be acted on. */}
              <span className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                {!photo.published && <Badge tone="warn">Draft</Badge>}
                {photo.visibility === 'PRIVATE' && <Badge tone="muted">Private</Badge>}
                {(!photo.cameraId || !photo.filmStockId) && photo.published && <Badge tone="muted">No gear</Badge>}
              </span>

              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pt-4 pb-1
                               text-[10px] leading-tight text-left text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity">
                {photo.camera?.name ?? 'No camera'} · {photo.filmStock?.name ?? 'No film'}
              </span>
            </button>
          )
        })}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-neutral-600 tabular-nums">Page {page} of {lastPage}</p>
          <div className="flex gap-2">
            <PageButton onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Previous</PageButton>
            <PageButton onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage || loading}>Next</PageButton>
          </div>
        </div>
      )}

      {/* The editing bar only exists once something is selected, so the page is
          a gallery until you make it a tool. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[75dvh] overflow-y-auto
                        bg-[#0a0a0a]/95 backdrop-blur border-t border-neutral-800
                        pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex w-full items-center gap-2 sm:w-auto sm:mr-2">
                <span className="text-sm text-white font-bold tabular-nums">{selected.size}</span>
                <span className="text-xs text-neutral-500">selected</span>
                <button
                  onClick={() => setSelected(new Set())}
                  className={`-my-2 px-2 py-2 text-xs text-neutral-500 hover:text-white underline ${focusRing}`}
                >
                  clear
                </button>

                {/* On a phone the four fields stack, and the bar was 400px
                    tall over a 128px reserve — it covered the photographs it
                    was editing, with no way to scroll past it. They start
                    folded away here and are always open from sm, where the
                    row has the width to hold them. */}
                <button
                  type="button"
                  onClick={() => setEditingFields(v => !v)}
                  aria-expanded={editingFields}
                  className={`-my-2 ml-auto px-2 py-2 text-xs uppercase tracking-wide text-neutral-400
                              hover:text-white sm:hidden ${focusRing}`}
                >
                  {editingFields ? 'Hide fields' : 'Edit fields'}
                </button>
              </div>

              {/* display:contents from sm, so the fields sit in the outer
                  flex row exactly as they did before; a real box only below
                  sm, where it is the thing being folded. */}
              <div className={`${editingFields ? 'flex' : 'hidden'} w-full flex-wrap items-end gap-3 sm:contents`}>

                <div className="min-w-[180px]">
                  <Combobox
                    label="Camera"
                    options={cameras}
                    value={newCamera}
                    onChange={setNewCamera}
                    placeholder="Leave unchanged"
                  />
                </div>

                <div className="min-w-[180px]">
                  <Combobox
                    label="Film"
                    options={films}
                    value={newFilm}
                    onChange={setNewFilm}
                    placeholder="Leave unchanged"
                  />
                </div>

                <Field label="Date taken">
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className={fieldClass}
                  />
                </Field>

                <Field label="Visibility">
                  <select
                    value={newVisibility}
                    onChange={e => setNewVisibility(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Leave unchanged</option>
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </Field>

              </div>

              <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:ml-auto">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                >
                  Delete
                </Button>
                <Button size="sm" onClick={apply} disabled={busy || changeCount === 0}>
                  {busy ? 'Applying…' : changeCount === 0 ? 'Choose a change' : `Apply to ${selected.size}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${selected.size} photo${selected.size === 1 ? '' : 's'}?`}
        confirmLabel={`Delete ${selected.size}`}
        busyLabel="Deleting…"
        destructive
        onConfirm={removeSelected}
        onClose={() => setConfirmingDelete(false)}
      >
        The image files are removed from storage as well, along with their likes and comments.
        This cannot be undone.
      </ConfirmDialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  )
}

/**
 * What a screen reader hears on a tile.
 *
 * The label replaces the tile's whole subtree, so the badges and the gear
 * caption — draft, private, which camera and film are on the frame, the state
 * you are here to act on — were said nowhere at all: a hundred buttons reading
 * "Select photo 7, not pressed". Said here instead, as a sentence. The missing
 * gear the "No gear" badge marks falls out of the same clause, so the badge
 * needs no separate mention.
 */
function tileLabel(photo: Photo, index: number) {
  const subject = photo.caption?.trim() || `photo ${index + 1}`

  const gear =
    photo.camera && photo.filmStock ? `${photo.camera.name} on ${photo.filmStock.name}`
    : photo.camera ? `${photo.camera.name}, no film recorded`
    : photo.filmStock ? `${photo.filmStock.name}, no camera recorded`
    : 'No camera or film recorded'

  const states: string[] = []
  if (!photo.published) states.push('draft')
  if (photo.visibility === 'PRIVATE') states.push('private')

  return `Select ${subject}. ${gear}.${states.length ? ` Currently ${states.join(' and ')}.` : ''}`
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'warn' | 'muted' }) {
  return (
    <span
      className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-bold ${
        tone === 'warn' ? 'bg-yellow-500/90 text-black' : 'bg-black/70 text-neutral-300'
      }`}
    >
      {children}
    </span>
  )
}

function PageButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-xs uppercase tracking-wide border border-neutral-800 text-neutral-400
                 hover:text-white hover:border-neutral-600 disabled:opacity-30 transition-colors"
    >
      {children}
    </button>
  )
}
