'use client'

import { useEffect, useId, useState } from 'react'
import Combobox from '@/components/Combobox'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Alert from '@/components/ui/Alert'
import FieldLabel from '@/components/ui/FieldLabel'
import { FieldInput, FieldTextarea } from '@/components/ui/Field'
import { apiErrorMessage } from '@/lib/apiError'
import { rollHeader } from '@/lib/library/rollHeader'
import { useAddCatalogItem, withCatalogItem, type CatalogItem, type CatalogType } from './import/AddCatalogItem'
import RollDetailsForm, { EMPTY_DETAILS, type Catalog, type RollDetails } from './import/RollDetailsForm'

/**
 * The film, camera and lab catalog, loaded once when a dialog first needs it,
 * and a way to put a newly added item in it.
 */
let catalogPromise: Promise<Catalog> | null = null
export function useCatalog(enabled: boolean): [Catalog | null, (type: CatalogType, item: CatalogItem) => void] {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    if (!enabled) return
    const get = (url: string) => fetch(url).then(r => (r.ok ? r.json() : [])).catch(() => [])
    catalogPromise ??= Promise.all([get('/api/filmstocks'), get('/api/cameras'), get('/api/labs')])
      .then(([films, cameras, labs]) => ({ films, cameras, labs }))
    let live = true
    void catalogPromise.then(c => { if (live) setCatalog(c) })
    return () => { live = false }
  }, [enabled])
  const add = (type: CatalogType, item: CatalogItem) => {
    catalogPromise = catalogPromise?.then(c => withCatalogItem(c, type, item)) ?? null
    setCatalog(c => (c ? withCatalogItem(c, type, item) : c))
  }
  return [catalog, add]
}

/** The roll or photo field a catalog type fills. */
const CATALOG_FIELD = { film: 'filmStockId', camera: 'cameraId', lab: 'labId' } as const

/** A roll's details, edited and saved for every photo in it. */
export function RollEditDialog({ rollId, onClose, onSaved }: { rollId: string; onClose: () => void; onSaved: () => void }) {
  const [catalog, addToCatalog] = useCatalog(true)
  const addItem = useAddCatalogItem()
  const [details, setDetails] = useState<RollDetails | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = useId()

  useEffect(() => {
    void fetch(`/api/library/rolls/${rollId}`).then(r => r.json()).then(({ roll }) => {
      const text = (v: unknown) => (v == null ? '' : String(v))
      setTitle(text(roll.title))
      setDetails({
        filmStockId: text(roll.filmStockId), cameraId: text(roll.cameraId), labId: text(roll.labId),
        scannerModel: text(roll.scannerModel), shotFrom: text(roll.shotFrom), shotTo: text(roll.shotTo),
        developedAt: text(roll.developedAt), location: text(roll.location), ei: text(roll.ei), notes: text(roll.notes),
      })
    })
  }, [rollId])

  const save = async () => {
    if (!details) return
    setBusy(true)
    setError(null)
    const orNull = (v: string) => (v.trim() ? v.trim() : null)
    const res = await fetch(`/api/library/rolls/${rollId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: orNull(title), filmStockId: orNull(details.filmStockId), cameraId: orNull(details.cameraId), labId: orNull(details.labId),
        scannerModel: orNull(details.scannerModel), shotFrom: orNull(details.shotFrom), shotTo: orNull(details.shotTo),
        developedAt: orNull(details.developedAt), location: orNull(details.location), notes: orNull(details.notes),
        ei: details.ei ? Number(details.ei) : null,
      }),
    })
    setBusy(false)
    if (!res.ok) { setError(await apiErrorMessage(res, 'Could not save the details')); return }
    onSaved()
  }

  return (
    <>
    <Modal open onClose={onClose} title="Roll details" description="These apply to every photo in the roll." size="xl" busy={busy || addItem.open}>
      {!details || !catalog ? <p className="p-4 text-sm text-neutral-400">Loading…</p> : (
        <div className="space-y-4 p-4">
          <div>
            <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
            <FieldInput id={`${id}-title`} value={title} maxLength={120} placeholder="Optional" onChange={e => setTitle(e.target.value)} />
          </div>
          <RollDetailsForm details={details} catalog={catalog} saveState="idle"
            onChange={patch => setDetails(d => ({ ...(d ?? EMPTY_DETAILS), ...patch }))}
            onAddNew={(type, typed) => addItem.start(type, typed, item => {
              addToCatalog(type, item)
              setDetails(d => ({ ...(d ?? EMPTY_DETAILS), [CATALOG_FIELD[type]]: item.id }))
            })} />
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      )}
    </Modal>
    {addItem.dialog}
    </>
  )
}

export interface RollOption {
  id: string
  title: string | null
  shotFrom: string | null
  shotTo: string | null
  filmStock: string | null
  camera: string | null
  lab: string | null
  photoCount: number
}

/** Picks a roll: to move photos into, or to merge a roll into. Optionally offers a new roll. */
export function RollPickerDialog({ title, exclude, allowNew, onPick, onClose }: {
  title: string
  exclude?: string
  allowNew?: boolean
  onPick: (target: { rollId: string } | { newRoll: { title: string } }) => Promise<void>
  onClose: () => void
}) {
  const [rolls, setRolls] = useState<RollOption[] | null>(null)
  const [query, setQuery] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void fetch('/api/library/rolls').then(r => r.json()).then(body => setRolls(body.rolls ?? []))
  }, [])
  const label = (r: RollOption) => r.title || rollHeader(r) || 'Untitled roll'
  const shown = (rolls ?? []).filter(r => r.id !== exclude && `${label(r)} ${rollHeader(r)}`.toLowerCase().includes(query.toLowerCase()))
  const pick = async (target: Parameters<typeof onPick>[0]) => { setBusy(true); try { await onPick(target) } finally { setBusy(false) } }

  return (
    <Modal open onClose={onClose} title={title} size="md" busy={busy}>
      <div className="space-y-3 p-4">
        <FieldInput aria-label="Find a roll" placeholder="Find a roll" value={query} onChange={e => setQuery(e.target.value)} />
        <ul className="max-h-72 divide-y divide-neutral-800 overflow-y-auto border border-neutral-800">
          {!rolls && <li className="p-3 text-sm text-neutral-500">Loading…</li>}
          {rolls && shown.length === 0 && <li className="p-3 text-sm text-neutral-500">No other rolls</li>}
          {shown.map(r => (
            <li key={r.id}>
              <button type="button" disabled={busy} onClick={() => pick({ rollId: r.id })}
                className="block w-full px-3 py-2.5 text-left hover:bg-neutral-900 focus-visible:bg-neutral-900 focus-visible:outline-none">
                <span className="block truncate text-sm text-white">{label(r)}</span>
                <span className="block truncate text-xs text-neutral-500">{r.title ? `${rollHeader(r)} · ` : ''}{r.photoCount} photos</span>
              </button>
            </li>
          ))}
        </ul>
        {allowNew && (
          <div className="flex gap-2">
            <FieldInput aria-label="New roll title" placeholder="New roll title (optional)" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <Button disabled={busy} onClick={() => pick({ newRoll: { title: newTitle } })}>New roll</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Details for many photos at once. */
export function BulkDetailsDialog({ count, onClose, onApply }: {
  count: number
  onClose: () => void
  onApply: (changes: Record<string, string | null>) => Promise<{ keptByRoll: number } | { error: string }>
}) {
  const [catalog, addToCatalog] = useCatalog(true)
  const addItem = useAddCatalogItem()
  const [changes, setChanges] = useState<Record<string, string | null>>({})
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = useId()
  const set = (field: string, value: string) => setChanges(c => ({ ...c, [field]: value }))
  const addNew = (type: CatalogType) => (typed: string) => addItem.start(type, typed, item => {
    addToCatalog(type, item)
    set(CATALOG_FIELD[type], item.id)
  })

  return (
    <>
    <Modal open onClose={onClose} title={`Edit ${count} ${count === 1 ? 'photo' : 'photos'}`} size="lg" busy={busy || addItem.open}
      description="Only the fields you change are written. Photos in a roll take film, camera and lab from the roll.">
      {!catalog ? <p className="p-4 text-sm text-neutral-400">Loading…</p> : (
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Combobox options={catalog.films} value={changes.filmStockId ?? ''} onChange={v => set('filmStockId', v)} onAddNewClick={addNew('film')} label="Film stock" placeholder="Unchanged" />
            <Combobox options={catalog.cameras} value={changes.cameraId ?? ''} onChange={v => set('cameraId', v)} onAddNewClick={addNew('camera')} label="Camera" placeholder="Unchanged" />
            <Combobox options={catalog.labs} value={changes.labId ?? ''} onChange={v => set('labId', v)} onAddNewClick={addNew('lab')} label="Lab" placeholder="Unchanged" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor={`${id}-date`} hint="The day it was shot">Date</FieldLabel>
              <FieldInput id={`${id}-date`} type="date" value={changes.takenDate ?? ''} onChange={e => set('takenDate', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor={`${id}-caption`}>Caption</FieldLabel>
              <FieldTextarea id={`${id}-caption`} rows={2} maxLength={2000} value={changes.caption ?? ''} onChange={e => set('caption', e.target.value)} />
            </div>
          </div>
          {result && <Alert tone="success">{result}</Alert>}
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>{result ? 'Done' : 'Cancel'}</Button>
            <Button disabled={busy || Object.keys(changes).length === 0} onClick={async () => {
              setBusy(true); setError(null)
              const outcome = await onApply(Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== '')))
              setBusy(false)
              if ('error' in outcome) { setError(outcome.error); return }
              setResult(outcome.keptByRoll
                ? `Saved. ${outcome.keptByRoll} in rolls kept their roll's film, camera and lab; edit those on the roll.`
                : 'Saved.')
            }}>{busy ? 'Saving…' : 'Apply'}</Button>
          </div>
        </div>
      )}
    </Modal>
    {addItem.dialog}
    </>
  )
}

/** A line at the bottom of the screen after a change that can be undone. */
export function UndoBar({ message, onUndo, onDismiss }: { message: string; onUndo?: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 10000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-50 mx-auto flex w-fit max-w-[calc(100%-32px)] items-center gap-4 bg-neutral-800 px-4 py-3 text-sm text-white shadow-lg">
      <span>{message}</span>
      {onUndo && <button type="button" className="font-bold underline" onClick={() => { onUndo(); onDismiss() }}>Undo</button>}
    </div>
  )
}
