'use client'

import { useState } from 'react'
import { ADMIN_RESOURCES, type FieldSpec, type ResourceName } from '@/lib/admin/resources'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import { FieldControl, groupFields, toInput, useReferenceOptions } from './fieldControls'

type Row = Record<string, unknown>

/**
 * Edits one record, or adds a new one, with a form built from the resource's
 * own field specs.
 *
 * Only fields the server will accept are rendered, so the form cannot offer
 * something the API then refuses — the allowlist in lib/admin/resources is the
 * single description of what is editable, used by both sides.
 *
 * `row: null` is create mode: every field starts empty and every value the
 * admin fills in is submitted, rather than only what changed against a
 * baseline that does not exist yet.
 */
export default function EditRecordModal({
  resource, row, busy, onClose, onSave,
}: {
  resource: ResourceName
  row: Row | null
  busy: boolean
  onClose: () => void
  onSave: (changes: Record<string, unknown>) => Promise<boolean>
}) {
  const spec = ADMIN_RESOURCES[resource]
  const fields = Object.entries(spec.editable) as [string, FieldSpec][]
  // Mounted only while it is open, so the dialog is open whenever it exists.
  const panelRef = useDialogBehavior({ open: true, onClose })
  const options = useReferenceOptions(resource)

  const groups = groupFields(resource, fields)

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const [name, field] of fields) initial[name] = toInput(field, row?.[name])
    return initial
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!row) {
      await onSave(values)
      return
    }

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
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-record-title"
        className="bg-neutral-900 border border-neutral-800 max-w-2xl w-full my-8 focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 id="edit-record-title" className="text-lg font-bold text-white">
              {row ? `Edit ${spec.label.toLowerCase()}` : `New ${spec.label.toLowerCase()}`}
            </h2>
            {row && <p className="text-xs text-neutral-600 font-mono mt-0.5">{String(row.id)}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`${iconButtonClass} -mr-3`}>
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-6">
          {groups.map((group, i) => (
            <div key={group.title ?? `_${i}`} className={i > 0 ? 'pt-6 border-t border-neutral-800' : ''}>
              {group.title && (
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">
                  {group.title}
                </h3>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {group.fields.map(([name, field]) => (
                  <div key={name} className={field.kind === 'longtext' ? 'sm:col-span-2' : ''}>
                    <label htmlFor={`field-${name}`} className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                      {field.label}
                    </label>
                    <FieldControl
                      id={`field-${name}`}
                      column={name}
                      field={field}
                      value={values[name]}
                      options={field.source ? options[field.source] : undefined}
                      onChange={v => setValues(prev => ({ ...prev, [name]: v }))}
                    />
                    {field.help && <p className="text-[11px] text-neutral-600 mt-1">{field.help}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800 mt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Saving…' : row ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
