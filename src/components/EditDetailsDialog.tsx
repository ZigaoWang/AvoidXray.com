'use client'

import { useId, useState } from 'react'
import Combobox from '@/components/Combobox'
import { useAddCatalogItem } from '@/components/AddCatalogItem'
import { fieldsForNewItem, useCatalog, type CatalogType } from '@/components/useCatalog'
import Button from '@/components/ui/Button'
import { fieldClass, FieldTextarea } from '@/components/ui/Field'
import FieldLabel from '@/components/ui/FieldLabel'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import SegmentedButtons from '@/components/ui/SegmentedButtons'

export type DetailField = 'film' | 'camera' | 'lab' | 'date' | 'caption' | 'visibility'
export type RollChoice = 'roll' | 'photos'

/**
 * The row that puts a field back to changing nothing. Combobox has no empty
 * state of its own, so without it a camera picked by mistake could not be
 * unpicked; "leave unchanged" is a real answer here.
 */
const UNCHANGED = { id: '', name: 'Leave unchanged' }
const COLUMN = { film: 'filmStockId', camera: 'cameraId', lab: 'labId' } as const

/**
 * Editing the details of a selection: Your photos and the library. Only the
 * fields filled in are sent, so setting the film on forty photos does not also
 * blank their captions. The pickers open a list below themselves, which a
 * scrolling dialog would clip, so this one does not scroll.
 */
export default function EditDetailsDialog({ open, count, fields, inRolls = 0, progress, onApply, onClose }: {
  open: boolean
  count: number
  fields: DetailField[]
  /** How many of the selection are in rolls: a film, camera or lab change then asks where it goes. */
  inRolls?: number
  /** Shown on the button while a large selection is applied in batches. */
  progress?: string
  onApply: (changes: Record<string, string | null>, rolls?: RollChoice) => Promise<void>
  onClose: () => void
}) {
  const id = useId()
  const [catalog, addToCatalog] = useCatalog(open)
  const addItem = useAddCatalogItem()
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [rolls, setRolls] = useState<RollChoice>('roll')
  const [busy, setBusy] = useState(false)
  const set = (field: string, value: string) => setChanges(c => ({ ...c, [field]: value }))
  const gearChosen = (['filmStockId', 'cameraId', 'labId'] as const).some(f => changes[f])
  const chosen = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== ''))
  const close = () => { setChanges({}); setRolls('roll'); onClose() }

  const picker = (type: CatalogType, label: string) => {
    const options = type === 'film' ? catalog?.films : type === 'camera' ? catalog?.cameras : catalog?.labs
    return (
      <Combobox label={label} options={[UNCHANGED, ...(options ?? [])]} value={changes[COLUMN[type]] ?? ''}
        onChange={v => set(COLUMN[type], v)} placeholder="Leave unchanged"
        onAddNewClick={typed => addItem.start(type, typed, item => {
          addToCatalog(type, item)
          setChanges(c => ({ ...c, ...fieldsForNewItem(type, item, c) }))
        })} />
    )
  }

  return (
    <>
      <Modal open={open} onClose={close} busy={busy || addItem.open} size="md" scrolls={false}
        title={`Edit ${count.toLocaleString()} ${count === 1 ? 'photo' : 'photos'}`}
        description="Only what you fill in changes. Everything else stays as it is.">
        <div className="space-y-4 p-4">
          {fields.includes('film') && picker('film', 'Film')}
          {fields.includes('camera') && picker('camera', 'Camera')}
          {fields.includes('lab') && picker('lab', 'Lab')}
          {gearChosen && inRolls > 0 && (
            <div>
              <p id={`${id}-rolls`} className="mb-2 text-sm text-neutral-300">
                {inRolls === count ? 'These photos are in rolls,' : `${inRolls.toLocaleString()} of these are in rolls,`} which set their film, camera and lab.
              </p>
              <SegmentedButtons labelledBy={`${id}-rolls`} fullWidth active={rolls} onChange={setRolls}
                options={[{ value: 'roll', label: 'Change for the whole roll' }, { value: 'photos', label: 'Just these photos' }] as const} />
              {rolls === 'photos' && <p className="mt-2 text-xs text-neutral-500">They leave their rolls and keep everything else.</p>}
            </div>
          )}
          {(fields.includes('date') || fields.includes('visibility')) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.includes('date') && (
                <div>
                  <FieldLabel htmlFor={`${id}-date`}>Date taken</FieldLabel>
                  <input id={`${id}-date`} type="date" value={changes.takenDate ?? ''} onChange={e => set('takenDate', e.target.value)} className={fieldClass} />
                </div>
              )}
              {fields.includes('visibility') && (
                <div>
                  <FieldLabel htmlFor={`${id}-visibility`}>Visibility</FieldLabel>
                  <select id={`${id}-visibility`} value={changes.visibility ?? ''} onChange={e => set('visibility', e.target.value)} className={fieldClass}>
                    <option value="">Leave unchanged</option>
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </div>
              )}
            </div>
          )}
          {fields.includes('caption') && (
            <div>
              <FieldLabel htmlFor={`${id}-caption`}>Caption</FieldLabel>
              <FieldTextarea id={`${id}-caption`} rows={2} maxLength={2000} value={changes.caption ?? ''} placeholder="Leave unchanged"
                onChange={e => set('caption', e.target.value)} />
            </div>
          )}
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button disabled={busy || Object.keys(chosen).length === 0} onClick={async () => {
            setBusy(true)
            try {
              await onApply(chosen, gearChosen && inRolls > 0 ? rolls : undefined)
              setChanges({}); setRolls('roll')
            } finally {
              setBusy(false)
            }
          }}>
            {busy ? progress ?? 'Applying…' : `Apply to ${count.toLocaleString()}`}
          </Button>
        </ModalFooter>
      </Modal>
      {addItem.dialog}
    </>
  )
}
