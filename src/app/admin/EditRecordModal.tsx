'use client'

import { useEffect, useRef, useState } from 'react'
import { ADMIN_RESOURCES, type FieldSpec, type ResourceName } from '@/lib/admin/resources'

type Row = Record<string, unknown>

/**
 * Edits one record, with a form built from the resource's own field specs.
 *
 * Only fields the server will accept are rendered, so the form cannot offer
 * something the API then refuses — the allowlist in lib/admin/resources is the
 * single description of what is editable, used by both sides.
 */
export default function EditRecordModal({
  resource, row, busy, onClose, onSave,
}: {
  resource: ResourceName
  row: Row
  busy: boolean
  onClose: () => void
  onSave: (changes: Record<string, unknown>) => Promise<boolean>
}) {
  const spec = ADMIN_RESOURCES[resource]
  const fields = Object.entries(spec.editable) as [string, FieldSpec][]
  const dialogRef = useRef<HTMLDivElement>(null)

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const [name, field] of fields) initial[name] = toInput(field, row[name])
    return initial
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Only what actually changed, so an untouched field is never rewritten and
    // a concurrent edit elsewhere is not silently reverted.
    const changes: Record<string, unknown> = {}
    for (const [name, field] of fields) {
      const before = toInput(field, row[name])
      if (values[name] !== before) changes[name] = values[name]
    }
    if (Object.keys(changes).length === 0) { onClose(); return }
    await onSave(changes)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-record-title"
        className="bg-neutral-900 border border-neutral-800 max-w-2xl w-full my-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 id="edit-record-title" className="text-lg font-bold text-white">Edit {spec.label.toLowerCase()}</h2>
            <p className="text-xs text-neutral-600 font-mono mt-0.5">{String(row.id)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-neutral-500 hover:text-white p-2 -mr-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 grid gap-4 sm:grid-cols-2">
          {fields.map(([name, field]) => (
            <div key={name} className={field.kind === 'longtext' ? 'sm:col-span-2' : ''}>
              <label htmlFor={`field-${name}`} className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                {field.label}
              </label>
              <FieldInput
                id={`field-${name}`}
                field={field}
                value={values[name]}
                onChange={v => setValues(prev => ({ ...prev, [name]: v }))}
              />
              {field.help && <p className="text-[11px] text-neutral-600 mt-1">{field.help}</p>}
            </div>
          ))}

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-neutral-800 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-[#D32F2F] text-white hover:bg-[#B71C1C] disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm text-white ' +
  'placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600'

function FieldInput({
  id, field, value, onChange,
}: {
  id: string
  field: FieldSpec
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (field.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 h-9">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 accent-[#D32F2F]"
        />
        <span className="text-sm text-neutral-400">{value === true ? 'Yes' : 'No'}</span>
      </label>
    )
  }

  if (field.kind === 'enum') {
    return (
      <select id={id} value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={inputClass}>
        <option value="">—</option>
        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (field.kind === 'longtext') {
    return (
      <textarea
        id={id}
        rows={4}
        maxLength={field.maxLength}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className={`${inputClass} resize-y`}
      />
    )
  }

  return (
    <input
      id={id}
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      maxLength={field.kind === 'text' ? field.maxLength : undefined}
      min={field.min}
      max={field.max}
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    />
  )
}

/** The record's stored value, as the matching form control expects it. */
function toInput(field: FieldSpec, value: unknown): unknown {
  if (field.kind === 'boolean') return value === true
  if (value === null || value === undefined) return ''
  if (field.kind === 'date') {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  }
  if (field.kind === 'stringList') return Array.isArray(value) ? value.join(', ') : String(value)
  return String(value)
}
