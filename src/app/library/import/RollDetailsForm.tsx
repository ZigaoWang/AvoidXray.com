'use client'

import { useId } from 'react'
import Combobox from '@/components/Combobox'
import FieldLabel from '@/components/ui/FieldLabel'
import { FieldInput, FieldTextarea, fieldClass } from '@/components/ui/Field'
import type { Catalog } from '@/components/useCatalog'

export interface RollDetails {
  filmStockId: string
  cameraId: string
  labId: string
  scannerModel: string
  shotFrom: string
  shotTo: string
  developedAt: string
  location: string
  ei: string
  notes: string
}

export const EMPTY_DETAILS: RollDetails = {
  filmStockId: '', cameraId: '', labId: '', scannerModel: '', shotFrom: '', shotTo: '',
  developedAt: '', location: '', ei: '', notes: '',
}


/**
 * A roll's details, saved as they change. Film, camera and lab come from the
 * catalog, with a way to add what is missing; dates take a month, and a day
 * when the owner knows it.
 */
export default function RollDetailsForm({
  details, catalog, onChange, onAddNew, saveState,
}: {
  details: RollDetails
  catalog: Catalog
  onChange: (patch: Partial<RollDetails>) => void
  onAddNew: (type: 'camera' | 'film' | 'lab', typed: string) => void
  saveState: 'idle' | 'saving' | 'saved' | { error: string }
}) {
  const id = useId()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Combobox
          options={catalog.films}
          value={details.filmStockId}
          onChange={filmStockId => onChange({ filmStockId })}
          placeholder="Select…"
          label="Film stock"
          onAddNewClick={typed => onAddNew('film', typed)}
        />
        <Combobox
          options={catalog.cameras}
          value={details.cameraId}
          onChange={cameraId => {
            const camera = catalog.cameras.find(c => c.id === cameraId)
            onChange({ cameraId, ...(camera?.defaultFilmStockId && !details.filmStockId ? { filmStockId: camera.defaultFilmStockId } : {}) })
          }}
          placeholder="Select…"
          label="Camera"
          onAddNewClick={typed => onAddNew('camera', typed)}
        />
        <Combobox
          options={catalog.labs}
          value={details.labId}
          onChange={labId => onChange({ labId })}
          placeholder="Select…"
          label="Lab"
          onAddNewClick={typed => onAddNew('lab', typed)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <DateField label="Shot from" value={details.shotFrom} onChange={shotFrom => onChange({ shotFrom })} />
        <DateField label="Shot until" value={details.shotTo} onChange={shotTo => onChange({ shotTo })} hint="If it took a while" />
        <DateField label="Developed" value={details.developedAt} onChange={developedAt => onChange({ developedAt })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel htmlFor={`${id}-location`}>Location</FieldLabel>
          <FieldInput id={`${id}-location`} value={details.location} maxLength={200} onChange={e => onChange({ location: e.target.value })} placeholder="Where it was shot" />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-ei`} hint="If pushed or pulled">EI</FieldLabel>
          <FieldInput id={`${id}-ei`} inputMode="numeric" value={details.ei} onChange={e => onChange({ ei: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="Box speed" />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-scanner`} hint="From the files">Scanner</FieldLabel>
          <FieldInput id={`${id}-scanner`} value={details.scannerModel} maxLength={100} onChange={e => onChange({ scannerModel: e.target.value })} />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
        <FieldTextarea id={`${id}-notes`} rows={2} maxLength={2000} value={details.notes} onChange={e => onChange({ notes: e.target.value })} />
      </div>

      <p className="text-xs text-neutral-500" aria-live="polite">
        {saveState === 'saving' && 'Saving…'}
        {saveState === 'saved' && 'Saved'}
        {typeof saveState === 'object' && <span className="text-brand">{saveState.error}</span>}
      </p>
    </div>
  )
}

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

/** A month, and a day if known. Stored as "YYYY-MM" or "YYYY-MM-DD". */
function DateField({ label, value, onChange, hint }: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  const id = useId()
  const month = value.slice(0, 7)
  const day = value.length === 10 ? value.slice(8) : ''
  const thisMonth = new Date().toISOString().slice(0, 7)
  return (
    <div>
      <FieldLabel htmlFor={`${id}-month`} hint={hint}>{label}</FieldLabel>
      {/* Sized by the wrappers: the shared field class is full width. */}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <input
            id={`${id}-month`}
            type="month"
            max={thisMonth}
            value={month}
            onChange={e => onChange(e.target.value ? (day ? `${e.target.value}-${day}` : e.target.value) : '')}
            className={fieldClass}
          />
        </div>
        <div className="w-20 shrink-0">
          <select
            aria-label={`${label}, day`}
            value={day}
            disabled={!month}
            onChange={e => onChange(e.target.value ? `${month}-${e.target.value}` : month)}
            className={fieldClass}
          >
            <option value="">Day</option>
            {DAYS.map(d => <option key={d} value={d}>{Number(d)}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
