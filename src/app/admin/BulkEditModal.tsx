'use client'

import { useEffect, useState } from 'react'
import { ADMIN_RESOURCES, type FieldSpec, type ResourceName } from '@/lib/admin/resources'
import { FieldInput, useReferenceOptions } from './fieldControls'

/**
 * Applies one set of changes to a whole selection.
 *
 * Every field carries its own "change this" tick, and only ticked fields are
 * sent. The single-record form can infer intent by diffing against the record
 * it opened; a selection has no such baseline — forty photos have forty
 * different captions — so an empty box would be ambiguous between "leave these
 * alone" and "clear them all". The tick makes that the admin's decision, and
 * makes clearing a field across a selection possible rather than unreachable.
 */
export default function BulkEditModal({
  resource, count, busy, onClose, onSave,
}: {
  resource: ResourceName
  count: number
  busy: boolean
  onClose: () => void
  onSave: (changes: Record<string, unknown>) => Promise<boolean>
}) {
  const spec = ADMIN_RESOURCES[resource]
  // A unique field cannot be written across a selection — the server refuses
  // it — so it is not offered here either.
  const fields = (Object.entries(spec.editable) as [string, FieldSpec][])
    .filter(([name]) => !(resource === 'users' && name === 'username'))

  const options = useReferenceOptions(resource)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const [name, field] of fields) initial[name] = field.kind === 'boolean' ? false : ''
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

  const chosen = fields.filter(([name]) => enabled[name])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (chosen.length === 0) return
    const changes: Record<string, unknown> = {}
    for (const [name] of chosen) changes[name] = values[name]
    await onSave(changes)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-edit-title"
        className="bg-neutral-900 border border-neutral-800 max-w-2xl w-full my-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 id="bulk-edit-title" className="text-lg font-bold text-white">
              Edit {count} {count === 1 ? spec.label.toLowerCase() : spec.plural.toLowerCase()}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Only the fields you tick are changed. The rest are left as they are.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-neutral-500 hover:text-white p-2 -mr-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 grid gap-4 sm:grid-cols-2">
          {fields.map(([name, field]) => {
            const on = enabled[name] === true
            return (
              <div key={name} className={field.kind === 'longtext' ? 'sm:col-span-2' : ''}>
                <label className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={e => setEnabled(prev => ({ ...prev, [name]: e.target.checked }))}
                    className="w-3.5 h-3.5 accent-[#D32F2F]"
                  />
                  <span className={`text-xs uppercase tracking-wide ${on ? 'text-white' : 'text-neutral-500'}`}>
                    {field.label}
                  </span>
                </label>
                <FieldInput
                  id={`bulk-field-${name}`}
                  column={name}
                  field={field}
                  value={values[name]}
                  disabled={!on}
                  options={field.source ? options[field.source] : undefined}
                  onChange={v => setValues(prev => ({ ...prev, [name]: v }))}
                />
                {on && field.help && <p className="text-[11px] text-neutral-600 mt-1">{field.help}</p>}
              </div>
            )
          })}

          <div className="sm:col-span-2 flex items-center justify-between gap-2 pt-2 border-t border-neutral-800 mt-2">
            <p className="text-xs text-neutral-600">
              {chosen.length === 0
                ? 'Tick a field to change it'
                : `${chosen.length} ${chosen.length === 1 ? 'field' : 'fields'} will be written to all ${count}`}
            </p>
            <div className="flex gap-2">
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
                disabled={busy || chosen.length === 0}
                className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-[#D32F2F] text-white hover:bg-[#B71C1C]
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? 'Saving…' : `Apply to ${count}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
