'use client'

import { useEffect, useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import Alert from '@/components/ui/Alert'
import FieldLabel from '@/components/ui/FieldLabel'
import { FieldInput } from '@/components/ui/Field'
import { apiErrorMessage } from '@/lib/apiError'
import { rollHeader } from '@/lib/library/rollHeader'
import { useAddCatalogItem } from '@/components/AddCatalogItem'
import { fieldsForNewItem, useCatalog } from '@/components/useCatalog'
import RollDetailsForm, { EMPTY_DETAILS, type RollDetails } from './import/RollDetailsForm'

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
    void fetch(`/api/library/rolls/${rollId}`).then(async r => {
      if (!r.ok) throw new Error(await apiErrorMessage(r, 'Could not load this roll'))
      return r.json()
    }).then(({ roll }) => {
      const text = (v: unknown) => (v == null ? '' : String(v))
      setTitle(text(roll.title))
      setDetails({
        filmStockId: text(roll.filmStockId), cameraId: text(roll.cameraId), labId: text(roll.labId),
        scannerModel: text(roll.scannerModel), shotFrom: text(roll.shotFrom), shotTo: text(roll.shotTo),
        developedAt: text(roll.developedAt), location: text(roll.location), ei: text(roll.ei), notes: text(roll.notes),
      })
    }).catch(error => setError(error instanceof Error ? error.message : 'Could not load this roll'))
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
      {!details || !catalog ? <div className="p-4">{error ? <Alert>{error}</Alert> : <p className="text-sm text-neutral-400">Loading…</p>}</div> : (
        <div className="space-y-4 p-4">
          <div>
            <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
            <FieldInput id={`${id}-title`} value={title} maxLength={120} placeholder="Optional" onChange={e => setTitle(e.target.value)} />
          </div>
          <RollDetailsForm details={details} catalog={catalog} saveState="idle"
            onChange={patch => setDetails(d => ({ ...(d ?? EMPTY_DETAILS), ...patch }))}
            onAddNew={(type, typed) => addItem.start(type, typed, item => {
              addToCatalog(type, item)
              setDetails(d => ({ ...(d ?? EMPTY_DETAILS), ...fieldsForNewItem(type, item, d ?? EMPTY_DETAILS) }))
            })} />
          {error && <Alert>{error}</Alert>}
        </div>
      )}
      {details && catalog && (
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </ModalFooter>
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
