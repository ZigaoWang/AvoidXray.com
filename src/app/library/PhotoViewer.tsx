'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Combobox from '@/components/Combobox'
import Button from '@/components/ui/Button'
import FieldLabel from '@/components/ui/FieldLabel'
import { FieldInput, FieldTextarea } from '@/components/ui/Field'
import { apiErrorMessage } from '@/lib/apiError'
import { rollHeader } from '@/lib/library/rollHeader'
import { useAddCatalogItem } from '@/components/AddCatalogItem'
import { fieldsForNewItem, useCatalog, type CatalogType } from '@/components/useCatalog'

interface ViewerPhoto {
  id: string
  src: string
  width: number
  height: number
  caption: string | null
  takenDate: string | null
  published: boolean
  held: boolean
  originalPath: string | null
  originalFilename: string | null
  scannerModel: string | null
  filmStockId: string | null
  cameraId: string | null
  labId: string | null
  filmStock: string | null
  camera: string | null
  lab: string | null
  roll: { id: string; title: string | null; shotFrom: string | null; shotTo: string | null } | null
  frame: number
  frames: number
  prevId: string | null
  nextId: string | null
}

async function fetchPhoto(id: string): Promise<ViewerPhoto | null> {
  const res = await fetch(`/api/library/photos/${id}`).catch(() => null)
  return res?.ok ? ((await res.json()) as ViewerPhoto) : null
}

/**
 * One photo, full size from its stored display version, with its details
 * editable beside it. Arrow keys walk the roll; P publishes or unpublishes;
 * Escape closes.
 */
export default function PhotoViewer({ photoId, onNavigate, onClose, onChanged, onTrash, onEditRoll }: {
  photoId: string
  onNavigate: (id: string) => void
  onClose: () => void
  onChanged: () => void
  onTrash: (id: string) => void
  onEditRoll: (rollId: string) => void
}) {
  const [photo, setPhoto] = useState<ViewerPhoto | null>(null)
  const [missing, setMissing] = useState(false)
  const [caption, setCaption] = useState('')
  const [takenDate, setTakenDate] = useState('')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  const id = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const loose = !!photo && !photo.roll
  const [catalog, addToCatalog] = useCatalog(loose)
  const addItem = useAddCatalogItem()

  const apply = useCallback((body: ViewerPhoto | null) => {
    if (!body) { setMissing(true); return }
    setMissing(false)
    setPhoto(body)
    setCaption(body.caption ?? '')
    setTakenDate(body.takenDate ?? '')
    setSaved('idle')
  }, [])
  const load = useCallback(() => fetchPhoto(photoId).then(apply), [photoId, apply])
  useEffect(() => {
    let live = true
    void fetchPhoto(photoId).then(body => { if (live) apply(body) })
    return () => { live = false }
  }, [photoId, apply])
  useEffect(() => { dialog.current?.focus() }, [])

  const save = async (changes: Record<string, string | null>) => {
    setSaved('saving')
    const res = await fetch(`/api/library/photos/${photoId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
    })
    if (!res.ok) { setSaved(await apiErrorMessage(res, 'Could not save')); return }
    setSaved('saved')
    onChanged()
    void load()
  }

  const addNew = (type: CatalogType) => (typed: string) =>
    addItem.start(type, typed, item => { addToCatalog(type, item); void save(fieldsForNewItem(type, item, { filmStockId: photo?.filmStockId })) })

  const setPublished = useCallback(async (publish: boolean) => {
    const res = await fetch('/api/photos/bulk', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [photoId], changes: { visibility: publish ? 'PUBLIC' : 'PRIVATE' } }),
    })
    // Reported where the details save reports, so a refusal is never silent.
    if (!res.ok) { setSaved(await apiErrorMessage(res, publish ? 'Could not publish it' : 'Could not make it private')); return }
    onChanged()
    void load()
  }, [photoId, onChanged, load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      // The add-to-catalog form over the viewer has its own keys.
      if (addItem.open) return
      if (target.closest('input, textarea, select, [role="listbox"]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft' && photo?.prevId) onNavigate(photo.prevId)
      else if (event.key === 'ArrowRight' && photo?.nextId) onNavigate(photo.nextId)
      else if ((event.key === 'p' || event.key === 'P') && photo) void setPublished(!photo.published)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, onClose, onNavigate, setPublished, addItem.open])

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Photo" tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 outline-none lg:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
        {missing && <p className="text-neutral-400">This photo is not in your library any more.</p>}
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- the stored large version, public or signed for the owner
          <img src={photo.src} alt={photo.caption ?? ''} width={photo.width} height={photo.height}
            className="max-h-full max-w-full object-contain" />
        )}
        {photo?.prevId && (
          <button type="button" aria-label="Previous photo" onClick={() => onNavigate(photo.prevId!)}
            className="absolute left-2 top-1/2 h-12 w-12 -translate-y-1/2 bg-black/50 text-2xl text-white hover:bg-black/80">‹</button>
        )}
        {photo?.nextId && (
          <button type="button" aria-label="Next photo" onClick={() => onNavigate(photo.nextId!)}
            className="absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 bg-black/50 text-2xl text-white hover:bg-black/80">›</button>
        )}
        <button type="button" aria-label="Close" onClick={onClose}
          className="absolute right-2 top-2 h-11 w-11 bg-black/50 text-xl text-white hover:bg-black/80">×</button>
      </div>

      {photo && (
        <aside className="max-h-[45dvh] w-full shrink-0 overflow-y-auto border-t border-neutral-800 bg-[#0a0a0a] p-4 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {photo.roll ? (
                <>
                  <p className="truncate text-sm font-bold text-white">{photo.roll.title || rollHeader({ ...photo.roll, filmStock: photo.filmStock, camera: photo.camera, lab: photo.lab }) || 'Untitled roll'}</p>
                  <p className="text-xs text-neutral-500">Frame {photo.frame} of {photo.frames}</p>
                </>
              ) : <p className="text-sm font-bold text-white">Loose photo</p>}
            </div>
            <Button size="sm" variant={photo.published ? 'outline' : 'primary'} onClick={() => setPublished(!photo.published)}>
              {photo.published ? 'Unpublish' : 'Publish'}
            </Button>
          </div>
          {photo.held && <p className="mb-3 text-xs text-yellow-400">Held for review: it will not appear publicly until a moderator clears it.</p>}

          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor={`${id}-caption`}>Caption</FieldLabel>
              <FieldTextarea id={`${id}-caption`} rows={3} maxLength={2000} value={caption}
                onChange={e => setCaption(e.target.value)}
                onBlur={() => { if (caption !== (photo.caption ?? '')) void save({ caption }) }} />
            </div>
            <div>
              <FieldLabel htmlFor={`${id}-date`} hint="The day it was shot, if you know it">Date</FieldLabel>
              <FieldInput id={`${id}-date`} type="date" value={takenDate}
                onChange={e => { setTakenDate(e.target.value); void save({ takenDate: e.target.value || null }) }} />
            </div>

            {photo.roll ? (
              <div className="text-sm">
                <p className="text-neutral-400">{[photo.filmStock, photo.camera, photo.lab].filter(Boolean).join(' · ') || 'No film, camera or lab yet'}</p>
                <button type="button" className="mt-1 text-white underline underline-offset-2" onClick={() => onEditRoll(photo.roll!.id)}>
                  Edit the roll&apos;s details
                </button>
              </div>
            ) : catalog && (
              <div className="space-y-3">
                <Combobox options={catalog.films} value={photo.filmStockId ?? ''} label="Film stock" placeholder="Select…"
                  onChange={v => void save({ filmStockId: v || null })} onAddNewClick={addNew('film')} />
                <Combobox options={catalog.cameras} value={photo.cameraId ?? ''} label="Camera" placeholder="Select…"
                  onChange={v => void save({ cameraId: v || null })} onAddNewClick={addNew('camera')} />
                <Combobox options={catalog.labs} value={photo.labId ?? ''} label="Lab" placeholder="Select…"
                  onChange={v => void save({ labId: v || null })} onAddNewClick={addNew('lab')} />
              </div>
            )}

            <dl className="space-y-1 text-xs text-neutral-500">
              {photo.originalFilename && <div><dt className="inline">File: </dt><dd className="inline text-neutral-300">{photo.originalFilename}</dd></div>}
              {photo.scannerModel && <div><dt className="inline">Scanner: </dt><dd className="inline text-neutral-300">{photo.scannerModel}</dd></div>}
            </dl>
            <p className="text-xs text-neutral-500" aria-live="polite">
              {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved !== 'idle' ? <span className="text-brand">{saved}</span> : ''}
            </p>
            <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-4">
              {photo.originalPath && <a href={photo.originalPath} className="inline-flex h-8 items-center border border-neutral-700 px-4 text-xs text-white hover:border-neutral-500">Original</a>}
              <a href={`/photos/${photo.id}`} className="inline-flex h-8 items-center border border-neutral-700 px-4 text-xs text-white hover:border-neutral-500">Photo page</a>
              <Button size="sm" variant="destructive" onClick={() => onTrash(photo.id)}>Delete</Button>
            </div>
            <p className="hidden text-xs text-neutral-600 lg:block">← → to move through the roll · P to publish · Esc to close</p>
          </div>
        </aside>
      )}
      {addItem.dialog}
    </div>
  )
}
