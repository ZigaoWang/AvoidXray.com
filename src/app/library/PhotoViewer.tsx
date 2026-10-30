'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Image from 'next/image'
import Combobox from '@/components/Combobox'
import { useAddCatalogItem } from '@/components/AddCatalogItem'
import { lightboxChromeClass } from '@/components/Lightbox'
import { fieldsForNewItem, useCatalog, type CatalogType } from '@/components/useCatalog'
import Badge from '@/components/ui/Badge'
import Button, { buttonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import { FieldInput, FieldTextarea } from '@/components/ui/Field'
import FieldLabel from '@/components/ui/FieldLabel'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { eyebrowClass } from '@/components/ui/PageHeader'
import { textLinkClass } from '@/components/ui/TextLink'
import { blurPlaceholder } from '@/lib/blurhash'
import { fetchJson } from '@/lib/fetchJson'
import { rollHeader } from '@/lib/library/rollHeader'

interface ViewerPhoto {
  id: string
  src: string
  blurHash: string | null
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

type Gear = { filmStockId?: string | null; cameraId?: string | null; labId?: string | null }

/**
 * One photo from the library, as large as the screen allows, with its details
 * beside it on a wide screen and under it on a phone. The buttons over the
 * photo are the Lightbox's, and the panel is a dialog like every other: focus
 * stays inside, the page behind does not scroll, and focus returns on close.
 * Arrow keys walk the roll; P publishes or makes private; Escape closes.
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
  /** A film, camera or lab chosen for a photo in a roll, waiting on where it goes. */
  const [pendingGear, setPendingGear] = useState<Gear | null>(null)
  const id = useId()
  const [catalog, addToCatalog] = useCatalog()
  const addItem = useAddCatalogItem()
  const panelRef = useDialogBehavior({ open: true, onClose: () => { if (!addItem.open && !pendingGear) onClose() } })

  const apply = useCallback((body: ViewerPhoto | null) => {
    if (!body) { setMissing(true); return }
    setMissing(false)
    setPhoto(body)
    setCaption(body.caption ?? '')
    setTakenDate(body.takenDate ?? '')
    setSaved('idle')
  }, [])
  const load = useCallback(() => fetchJson<ViewerPhoto>(`/api/library/photos/${photoId}`).then(apply, () => apply(null)), [photoId, apply])
  useEffect(() => {
    let live = true
    void fetchJson<ViewerPhoto>(`/api/library/photos/${photoId}`).then(body => { if (live) apply(body) }, () => { if (live) apply(null) })
    return () => { live = false }
  }, [photoId, apply])

  const report = async (work: () => Promise<unknown>, fallback: string) => {
    setSaved('saving')
    try {
      await work()
      setSaved('saved')
      onChanged()
      void load()
    } catch (error) {
      setSaved(error instanceof Error ? error.message : fallback)
    }
  }
  const save = (changes: Record<string, string | null>) =>
    report(() => fetchJson(`/api/library/photos/${photoId}`, { method: 'PATCH', body: changes, fallback: 'Could not save' }), 'Could not save')
  /** Film, camera and lab: straight onto a loose photo; for one in a roll, asked first. */
  const saveGear = (gear: Gear) => {
    if (photo?.roll) setPendingGear(gear)
    else void save(gear as Record<string, string | null>)
  }
  const placeGear = (rolls: 'roll' | 'photos') => {
    const gear = pendingGear
    setPendingGear(null)
    if (gear) void report(() => fetchJson('/api/library/photos/details', { method: 'POST', body: { ids: [photoId], changes: gear, rolls } }), 'Could not save')
  }
  const addNew = (type: CatalogType) => (typed: string) =>
    addItem.start(type, typed, item => { addToCatalog(type, item); saveGear(fieldsForNewItem(type, item, { filmStockId: photo?.filmStockId })) })

  const setPublished = useCallback((publish: boolean) => report(
    () => fetchJson('/api/photos/bulk', { method: 'PATCH', body: { ids: [photoId], changes: { visibility: publish ? 'PUBLIC' : 'PRIVATE' } }, fallback: publish ? 'Could not publish it' : 'Could not make it private' }),
    'Could not change it',
  // `report` only reads state through setters and the props it closes over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [photoId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      // A form over the viewer has its own keys.
      if (addItem.open || pendingGear) return
      if (target.closest('input, textarea, select, [role="listbox"]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowLeft' && photo?.prevId) onNavigate(photo.prevId)
      else if (event.key === 'ArrowRight' && photo?.nextId) onNavigate(photo.nextId)
      else if ((event.key === 'p' || event.key === 'P') && photo) void setPublished(!photo.published)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, onNavigate, setPublished, addItem.open, pendingGear])

  const rollName = photo?.roll ? photo.roll.title || rollHeader({ ...photo.roll, filmStock: photo.filmStock, camera: photo.camera, lab: photo.lab }) || 'Untitled roll' : null
  const gearPicker = (type: CatalogType, label: string, field: keyof Gear, options: { id: string; name: string }[] | undefined) => (
    <Combobox options={options ?? []} value={photo?.[field] ?? ''} label={label} placeholder="Select…"
      onChange={v => saveGear({ [field]: v || null })} onAddNewClick={addNew(type)} />
  )

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={photo?.caption || 'Photo'} tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col overscroll-contain bg-black/95 outline-none lg:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
        {missing && <p className="text-neutral-400">This photo is not in your library any more.</p>}
        {photo && (
          <div className="relative h-full w-full">
            <Image key={photo.id} unoptimized fill src={photo.src} alt={photo.caption ?? ''} className="object-contain" sizes="100vw"
              {...blurPlaceholder(photo.blurHash, 0)} />
          </div>
        )}
        {photo?.prevId && (
          <button type="button" aria-label="Previous photo" onClick={() => onNavigate(photo.prevId!)}
            className={`absolute left-[max(0.5rem,env(safe-area-inset-left))] top-1/2 h-12 w-12 -translate-y-1/2 sm:h-14 sm:w-14 ${lightboxChromeClass}`}>
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        {photo?.nextId && (
          <button type="button" aria-label="Next photo" onClick={() => onNavigate(photo.nextId!)}
            className={`absolute right-[max(0.5rem,env(safe-area-inset-right))] top-1/2 h-12 w-12 -translate-y-1/2 sm:h-14 sm:w-14 ${lightboxChromeClass}`}>
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        )}
        <button type="button" aria-label="Close" onClick={onClose}
          className={`absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] h-11 w-11 ${lightboxChromeClass}`}>
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {photo && (
        <aside className="max-h-[45dvh] w-full shrink-0 overflow-y-auto border-t border-neutral-800 bg-[#0a0a0a] p-4 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={eyebrowClass}>{photo.roll ? `Frame ${photo.frame} of ${photo.frames}` : 'Loose photo'}</p>
              {rollName && <p className="mt-1 truncate text-sm font-bold text-white">{rollName}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {photo.published ? <Badge tone="success">Published</Badge> : <Badge>Private</Badge>}
                {photo.held && <Badge tone="warningSolid">Held for review</Badge>}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => void setPublished(!photo.published)}>
              {photo.published ? 'Make private' : 'Publish'}
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor={`${id}-caption`}>Caption</FieldLabel>
              <FieldTextarea id={`${id}-caption`} rows={3} maxLength={2000} value={caption}
                onChange={e => setCaption(e.target.value)}
                onBlur={() => { if (caption !== (photo.caption ?? '')) void save({ caption }) }} />
            </div>
            <div>
              <FieldLabel htmlFor={`${id}-date`} hint="The day it was shot, if you know it">Date taken</FieldLabel>
              <FieldInput id={`${id}-date`} type="date" value={takenDate}
                onChange={e => { setTakenDate(e.target.value); void save({ takenDate: e.target.value || null }) }} />
            </div>
            {catalog && (
              <div className="space-y-3">
                {gearPicker('film', 'Film', 'filmStockId', catalog.films)}
                {gearPicker('camera', 'Camera', 'cameraId', catalog.cameras)}
                {gearPicker('lab', 'Lab', 'labId', catalog.labs)}
                {photo.roll && (
                  <button type="button" className={`${textLinkClass} text-sm`} onClick={() => onEditRoll(photo.roll!.id)}>
                    Edit the roll&apos;s details
                  </button>
                )}
              </div>
            )}
            {(photo.originalFilename || photo.scannerModel) && (
              <dl className="space-y-1 text-xs text-neutral-500">
                {photo.originalFilename && <div><dt className="inline">File: </dt><dd className="inline text-neutral-300">{photo.originalFilename}</dd></div>}
                {photo.scannerModel && <div><dt className="inline">Scanner: </dt><dd className="inline text-neutral-300">{photo.scannerModel}</dd></div>}
              </dl>
            )}
            <p className="text-xs" aria-live="polite">
              {saved === 'saving' ? <span className="text-neutral-500">Saving…</span>
                : saved === 'saved' ? <span className="text-neutral-500">Saved</span>
                : saved !== 'idle' ? <span className="text-brand-light">{saved}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-4">
              {photo.originalPath && <a href={photo.originalPath} className={buttonClass('outline', 'sm')}>Original</a>}
              <a href={`/photos/${photo.id}`} className={buttonClass('outline', 'sm')}>Photo page</a>
              <Button size="sm" variant="destructive" onClick={() => onTrash(photo.id)}>Delete</Button>
            </div>
            <p className="hidden text-xs text-neutral-500 lg:block">← → to move through the roll · P to publish · Esc to close</p>
          </div>
        </aside>
      )}

      <Modal open={pendingGear !== null} onClose={() => setPendingGear(null)} size="sm"
        title="This photo is in a roll" description="A roll sets the film, camera and lab of every photo in it.">
        <div className="p-4 text-sm text-neutral-400">Change it for the whole roll, or take just this photo out of the roll with its own details.</div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => placeGear('photos')}>Just this photo</Button>
          <Button onClick={() => placeGear('roll')}>Change for the whole roll</Button>
        </ModalFooter>
      </Modal>
      {addItem.dialog}
    </div>
  )
}
