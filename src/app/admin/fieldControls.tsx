'use client'

import { useEffect, useState } from 'react'
import { ADMIN_RESOURCES, FIELD_GROUPS, displayValue, type FieldSpec, type ReferenceSource, type ResourceName } from '@/lib/admin/resources'
import { displayName } from '@/lib/seo/alt'
import { fieldClass, fieldClassMultiline } from '@/components/ui/Field'

/**
 * The form controls behind a resource's editable fields.
 *
 * Shared by the single-record and bulk edit modals so the two cannot drift:
 * whatever a field looks like when editing one photo is what it looks like when
 * editing forty.
 */

export interface Option { id: string; label: string }

/** The catalogs a `reference` field can point at. */
const REFERENCE_ENDPOINTS: Record<ReferenceSource, string> = {
  cameras: '/api/cameras',
  films: '/api/filmstocks',
  brands: '/api/brands',
}

/**
 * Loads every catalog this resource's reference fields need, once.
 *
 * Fetched per modal rather than per field, so a photo does not pull the camera
 * list twice.
 */
export function useReferenceOptions(resource: ResourceName) {
  const [options, setOptions] = useState<Partial<Record<ReferenceSource, Option[]>>>({})

  useEffect(() => {
    const fields = Object.values(ADMIN_RESOURCES[resource].editable) as FieldSpec[]
    const sources = Array.from(
      new Set(fields.map(f => f.source).filter((s): s is ReferenceSource => Boolean(s)))
    )

    let canceled = false
    Promise.all(
      sources.map(async source => {
        const res = await fetch(REFERENCE_ENDPOINTS[source])
        if (!res.ok) return [source, []] as const
        const rows = await res.json()
        const list: Option[] = Array.isArray(rows)
          ? rows.map((r: { id: string; name: string; brand?: string | null }) => ({
              id: r.id,
              label: displayName(r) ?? r.name,
            }))
          : []
        list.sort((a, b) => a.label.localeCompare(b.label))
        return [source, list] as const
      })
    ).then(entries => {
      if (!canceled) setOptions(Object.fromEntries(entries))
    }).catch(() => {})

    return () => { canceled = true }
  }, [resource])

  return options
}

export interface FieldGroup {
  title: string | null
  fields: [string, FieldSpec][]
}

/**
 * A resource's fields as sections instead of one long list.
 *
 * Shared by the single-record and bulk edit modals, same reasoning as the
 * controls above: whatever the sections look like on one record is what they
 * look like editing forty. A resource with no entry in `FIELD_GROUPS` (every
 * section but cameras and films — three or four fields reads fine as one
 * block) comes back as a single unlabeled group. A field on the resource but
 * left out of every declared group still renders, in a trailing unlabeled
 * group, rather than silently disappearing from the form.
 */
export function groupFields(resource: ResourceName, fields: [string, FieldSpec][]): FieldGroup[] {
  const declared = FIELD_GROUPS[resource]
  if (!declared) return [{ title: null, fields }]

  const placed = new Set(declared.flatMap(g => g.fields))
  const leftover = fields.filter(([name]) => !placed.has(name))
  const named = declared
    .map(g => ({ title: g.title as string | null, fields: fields.filter(([name]) => g.fields.includes(name)) }))
    .filter(g => g.fields.length > 0)
  return leftover.length > 0 ? [...named, { title: null, fields: leftover }] : named
}

/**
 * The control for one field, chosen by its kind.
 *
 * Everything that takes typing wears `fieldClass` — admin used to keep a
 * near-copy of it here, a shade darker, a tighter border, no fixed height and
 * its own idea of disabled, which is exactly the drift ui/Field.tsx exists to
 * stop. The iOS zoom guard that copy was written for (an input under 16px makes
 * Safari zoom the whole page in on focus) is inside `fieldClass` already, so
 * deleting it cost nothing.
 */
export function FieldControl({
  id, column, field, value, options, disabled, labelledBy, onChange,
}: {
  id: string
  column: string
  field: FieldSpec
  value: unknown
  options?: Option[]
  disabled?: boolean
  /**
   * Names the control where a `<label htmlFor>` cannot reach it: the bulk form
   * spends its one label on the field's "change this" tick, so the control
   * holding the value is pointed back at that same visible text.
   */
  labelledBy?: string
  onChange: (v: unknown) => void
}) {
  if (field.kind === 'reference') {
    // Names, not identifiers. The value written is still the id.
    return (
      <select
        id={id}
        aria-labelledby={labelledBy}
        value={String(value ?? '')}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={fieldClass}
      >
        <option value="">None</option>
        {(options ?? []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        {/* A value pointing at something no longer in the list still shows,
            rather than silently resetting the field to none. */}
        {value !== '' && value != null && !(options ?? []).some(o => o.id === value) && (
          <option value={String(value)}>{String(value)} (not in list)</option>
        )}
      </select>
    )
  }

  if (field.kind === 'boolean') {
    return (
      // h-10 is what `fieldClass` is, so a tick in one grid column occupies the
      // same row height as the text field beside it in the other.
      <label className="flex items-center gap-2 h-10">
        <input
          id={id}
          aria-labelledby={labelledBy}
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 accent-brand disabled:opacity-40"
        />
        <span className={`text-sm ${disabled ? 'text-neutral-600' : 'text-neutral-400'}`}>
          {value === true ? 'Yes' : 'No'}
        </span>
      </label>
    )
  }

  if (field.kind === 'enum') {
    return (
      <select
        id={id}
        aria-labelledby={labelledBy}
        value={String(value ?? '')}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={fieldClass}
      >
        <option value="">Not set</option>
        {/* Labeled with the same words the table uses, so "C-41" in a row is
            "C-41" in the form rather than "C41". */}
        {field.options?.map(o => <option key={o} value={o}>{displayValue(column, o)}</option>)}
      </select>
    )
  }

  if (field.kind === 'enumList') {
    // Ticks, not a comma-separated text box. This fell through to the plain
    // input, so the one camera field that can hold several members was edited
    // as the raw string "PROGRAM,MANUAL" — on the same screen whose other
    // dropdowns have said "Program" and "Manual" all along.
    const chosen = String(value ?? '').split(',').map(v => v.trim()).filter(Boolean)
    const toggle = (member: string) =>
      onChange(
        (chosen.includes(member) ? chosen.filter(m => m !== member) : [...chosen, member]).join(', ')
      )
    return (
      <div id={id} role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-x-4 gap-y-2 py-1">
        {field.options?.map(member => (
          <label key={member} className="flex items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={chosen.includes(member)}
              disabled={disabled}
              onChange={() => toggle(member)}
              className="w-4 h-4 accent-brand disabled:opacity-40"
            />
            {displayValue(column, member)}
          </label>
        ))}
      </div>
    )
  }

  if (field.kind === 'longtext') {
    return (
      <textarea
        id={id}
        aria-labelledby={labelledBy}
        rows={4}
        maxLength={field.maxLength}
        minLength={field.minLength}
        value={String(value ?? '')}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={`${fieldClassMultiline} resize-y`}
      />
    )
  }

  return (
    <input
      id={id}
      aria-labelledby={labelledBy}
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      maxLength={field.kind === 'text' ? field.maxLength : undefined}
      minLength={field.kind === 'text' ? field.minLength : undefined}
      min={field.min}
      max={field.max}
      value={String(value ?? '')}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={fieldClass}
    />
  )
}

/** The record's stored value, as the matching form control expects it. */
export function toInput(field: FieldSpec, value: unknown): unknown {
  if (field.kind === 'boolean') return value === true
  if (value === null || value === undefined) return ''
  if (field.kind === 'date') {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  }
  if (field.kind === 'stringList' || field.kind === 'enumList') {
    return Array.isArray(value) ? value.join(', ') : String(value)
  }
  return String(value)
}
