'use client'

import { useState } from 'react'
import { ADMIN_RESOURCES, UNIQUE_FIELDS, type FieldSpec, type ResourceName } from '@/lib/admin/resources'
import Button, { iconButtonClass } from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useDialogBehavior } from '@/components/ui/dialog'
import { FieldControl, groupFields, useReferenceOptions } from './fieldControls'

/**
 * Fields that hand out or take away privileges, and so are confirmed before
 * they are written across a selection.
 *
 * Deleting a selection makes the count be typed back, but editing one went
 * through on the first click whatever the field was, and `isAdmin` on users has
 * the same reach: one Apply grants or revokes administrator on every ticked
 * account. Named per resource, like UNIQUE_FIELDS, so the step stays on the few
 * fields that earn it and a caption or a visibility flag is still one click.
 */
const PRIVILEGE_FIELDS: Partial<Record<ResourceName, readonly string[]>> = {
  users: ['isAdmin'],
}

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
  const unique = UNIQUE_FIELDS[resource] ?? []
  const fields = (Object.entries(spec.editable) as [string, FieldSpec][])
    .filter(([name]) => !unique.includes(name))
  const groups = groupFields(resource, fields)

  const options = useReferenceOptions(resource)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const [name, field] of fields) initial[name] = field.kind === 'boolean' ? false : ''
    return initial
  })
  const [confirming, setConfirming] = useState(false)

  // The table mounts this only while it is open, so there is no closed state to
  // report. Escape belongs to the confirmation while that is up: one press
  // closing both dialogs would throw away the form behind it.
  const panelRef = useDialogBehavior({ open: true, onClose: () => { if (!confirming) onClose() } })

  const chosen = fields.filter(([name]) => enabled[name])
  const privileged = PRIVILEGE_FIELDS[resource] ?? []
  const escalating = chosen.filter(([name]) => privileged.includes(name))

  const apply = async () => {
    const changes: Record<string, unknown> = {}
    for (const [name] of chosen) changes[name] = values[name]
    const saved = await onSave(changes)
    // A save that failed leaves the form open and a toast saying why, both of
    // them behind this dialog.
    if (!saved) setConfirming(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (chosen.length === 0) return
    if (escalating.length > 0) {
      setConfirming(true)
      return
    }
    await apply()
  }

  const noun = count === 1 ? spec.label.toLowerCase() : spec.plural.toLowerCase()

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-edit-title"
        className="bg-neutral-900 border border-neutral-800 max-w-2xl w-full my-8 focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 id="bulk-edit-title" className="text-lg font-bold text-white">
              Edit {count} {noun}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Only the fields you tick are changed. The rest are left as they are.
            </p>
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
                {group.fields.map(([name, field]) => {
                  const on = enabled[name] === true
                  return (
                    <div key={name} className={field.kind === 'longtext' ? 'sm:col-span-2' : ''}>
                      {/* The single-record form gives this label to the control
                          that holds the value; here the label belongs to the
                          tick, which needs the field name and a target wider
                          than a 14px box. So the value control is named by the
                          same visible words instead of going unnamed. */}
                      <label className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={e => setEnabled(prev => ({ ...prev, [name]: e.target.checked }))}
                          className="w-3.5 h-3.5 accent-brand"
                        />
                        <span
                          id={`bulk-field-${name}-label`}
                          className={`text-xs uppercase tracking-wide ${on ? 'text-white' : 'text-neutral-500'}`}
                        >
                          {field.label}
                        </span>
                      </label>
                      <FieldControl
                        id={`bulk-field-${name}`}
                        labelledBy={`bulk-field-${name}-label`}
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
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800 mt-2">
            <p className="text-xs text-neutral-600">
              {chosen.length === 0
                ? 'Tick a field to change it'
                : `${chosen.length} ${chosen.length === 1 ? 'field' : 'fields'} will be written to all ${count}`}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={busy || chosen.length === 0}>
                {busy ? 'Saving…' : `Apply to ${count}`}
              </Button>
            </div>
          </div>
        </form>

        <ConfirmDialog
          open={confirming}
          title={`Change ${escalating.map(([, field]) => field.label.toLowerCase()).join(' and ')} for ${count} ${noun}?`}
          confirmLabel={`Apply to ${count}`}
          busyLabel="Saving…"
          destructive
          onConfirm={apply}
          onClose={() => setConfirming(false)}
        >
          {escalating.map(([name, field]) => (
            <p key={name}>
              {field.label} will be {values[name] === true ? 'granted to' : 'removed from'} all {count} {noun}.
            </p>
          ))}
        </ConfirmDialog>
      </div>
    </div>
  )
}
