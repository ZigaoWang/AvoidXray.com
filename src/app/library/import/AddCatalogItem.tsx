'use client'

import { useState, type ReactNode } from 'react'
import NewItemModal from '@/components/NewItemModal'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import FieldLabel from '@/components/ui/FieldLabel'
import { FieldInput } from '@/components/ui/Field'
import Modal from '@/components/ui/Modal'
import { buildNewItemFormData, CREATE_ENDPOINT, type NewItemPayload } from '@/lib/newItemForm'
import type { Catalog } from './RollDetailsForm'

export type CatalogType = 'camera' | 'film' | 'lab'
export interface CatalogItem { id: string; name: string }

/** The catalog with a newly added item in its list. */
export function withCatalogItem(catalog: Catalog, type: CatalogType, item: CatalogItem): Catalog {
  const key = type === 'film' ? 'films' : type === 'camera' ? 'cameras' : 'labs'
  const list: CatalogItem[] = catalog[key]
  return list.some(i => i.id === item.id) ? catalog : { ...catalog, [key]: [...list, item] }
}

/**
 * Adding a film stock, camera or lab that is missing from the catalog, from
 * any picker: the same forms and the same review as the upload page. `start`
 * opens the form; `onAdded` hears about the item once it exists.
 */
export function useAddCatalogItem(): {
  start: (type: CatalogType, typed: string, onAdded: (item: CatalogItem) => void) => void
  /** The form is open: a dialog under it should hold itself shut. */
  open: boolean
  dialog: ReactNode
} {
  const [adding, setAdding] = useState<{ type: CatalogType; typed: string; onAdded: (item: CatalogItem) => void } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (payload: NewItemPayload | { name: string; city: string; country: string }) => {
    if (!adding) return
    setBusy(true)
    setError(null)
    try {
      const res = adding.type === 'lab'
        ? await fetch('/api/labs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(CREATE_ENDPOINT[adding.type], { method: 'POST', body: buildNewItemFormData(payload as NewItemPayload) })
      const body = await res.json().catch(() => ({}))
      // A lab already in the catalog is the one meant: use it.
      const created = res.status === 409 && body.existing ? body.existing : res.ok ? body : null
      if (!created?.id) throw new Error(body.error ?? 'Could not add it')
      adding.onAdded(created)
      setAdding(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add it')
    } finally {
      setBusy(false)
    }
  }

  const dialog = adding && (adding.type === 'lab'
    ? <AddLabModal initialName={adding.typed} busy={busy} error={error} onSubmit={submit} onClose={() => setAdding(null)} />
    : <NewItemModal type={adding.type} initialName={adding.typed} onSubmit={submit} onCancel={() => setAdding(null)} loading={busy} error={error} />)

  return {
    start: (type, typed, onAdded) => { setError(null); setAdding({ type, typed, onAdded }) },
    open: adding !== null,
    dialog,
  }
}

function AddLabModal({ initialName, busy, error, onSubmit, onClose }: {
  initialName: string
  busy: boolean
  error: string | null
  onSubmit: (lab: { name: string; city: string; country: string }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  return (
    <Modal open onClose={onClose} title="Add a lab" description="It joins the catalog for everyone, like a camera or film stock." busy={busy}>
      <form className="space-y-4 p-4" onSubmit={e => { e.preventDefault(); onSubmit({ name: name.trim(), city: city.trim(), country: country.trim() }) }}>
        <div>
          <FieldLabel htmlFor="lab-name" required>Name</FieldLabel>
          <FieldInput id="lab-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="lab-city">City</FieldLabel>
            <FieldInput id="lab-city" value={city} onChange={e => setCity(e.target.value)} maxLength={80} />
          </div>
          <div>
            <FieldLabel htmlFor="lab-country">Country</FieldLabel>
            <FieldInput id="lab-country" value={country} onChange={e => setCountry(e.target.value)} maxLength={80} />
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add lab'}</Button>
        </div>
      </form>
    </Modal>
  )
}
