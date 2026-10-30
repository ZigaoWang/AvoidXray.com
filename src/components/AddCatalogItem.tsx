'use client'

import { useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import FieldLabel from '@/components/ui/FieldLabel'
import { FieldInput } from '@/components/ui/Field'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { apiErrorMessage } from '@/lib/apiError'
import { buildNewItemFormData, CREATE_ENDPOINT, type NewItemPayload } from '@/lib/newItemForm'
import type { CatalogItem, CatalogType } from './useCatalog'

// Loaded when first opened. Most visits never add anything.
const NewItemModal = dynamic(() => import('@/components/NewItemModal'))

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
      if (res.status === 413) throw new Error('That image is too large. The limit is 10 MB.')
      // A lab already in the catalog is the one meant: use it.
      const body = res.ok || res.status === 409 ? await res.json().catch(() => ({})) : null
      const created = res.status === 409 && body?.existing ? body.existing : res.ok ? body : null
      if (!created?.id) throw new Error(body?.error ?? await apiErrorMessage(res, 'Could not add it'))
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
      <form onSubmit={e => { e.preventDefault(); onSubmit({ name: name.trim(), city: city.trim(), country: country.trim() }) }}>
        <div className="space-y-4 p-4">
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
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add lab'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
