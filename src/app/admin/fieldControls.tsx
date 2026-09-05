'use client'

import { useEffect, useState } from 'react'
import { ADMIN_RESOURCES, displayValue, type FieldSpec, type ReferenceSource, type ResourceName } from '@/lib/admin/resources'

/**
 * The form controls behind a resource's editable fields.
 *
 * Shared by the single-record and bulk edit modals so the two cannot drift:
 * whatever a field looks like when editing one photo is what it looks like when
 * editing forty.
 */

export interface Option { id: string; label: string }

/** The catalogues a `reference` field can point at. */
const REFERENCE_ENDPOINTS: Record<ReferenceSource, string> = {
  cameras: '/api/cameras',
  films: '/api/filmstocks',
}

/**
 * Loads every catalogue this resource's reference fields need, once.
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

    let cancelled = false
    Promise.all(
      sources.map(async source => {
        const res = await fetch(REFERENCE_ENDPOINTS[source])
        if (!res.ok) return [source, []] as const
        const rows = await res.json()
        const list: Option[] = Array.isArray(rows)
          ? rows.map((r: { id: string; name: string; brand?: string | null }) => ({
              id: r.id,
              label: r.brand ? `${r.brand} ${r.name}` : r.name,
            }))
          : []
        list.sort((a, b) => a.label.localeCompare(b.label))
        return [source, list] as const
      })
    ).then(entries => {
      if (!cancelled) setOptions(Object.fromEntries(entries))
    }).catch(() => {})

    return () => { cancelled = true }
  }, [resource])

  return options
}

export const inputClass =
  'w-full bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm text-white ' +
  'placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600'

export function FieldInput({
  id, column, field, value, options, disabled, onChange,
}: {
  id: string
  column: string
  field: FieldSpec
  value: unknown
  options?: Option[]
  disabled?: boolean
  onChange: (v: unknown) => void
}) {
  if (field.kind === 'reference') {
    // Names, not identifiers. The value written is still the id.
    return (
      <select
        id={id}
        value={String(value ?? '')}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={`${inputClass} disabled:opacity-40`}
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
      <label className="flex items-center gap-2 h-9">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 accent-[#D32F2F] disabled:opacity-40"
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
        value={String(value ?? '')}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={`${inputClass} disabled:opacity-40`}
      >
        <option value="">Not set</option>
        {/* Labelled with the same words the table uses, so "C-41" in a row is
            "C-41" in the form rather than "C41". */}
        {field.options?.map(o => <option key={o} value={o}>{displayValue(column, o)}</option>)}
      </select>
    )
  }

  if (field.kind === 'longtext') {
    return (
      <textarea
        id={id}
        rows={4}
        maxLength={field.maxLength}
        minLength={field.minLength}
        value={String(value ?? '')}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={`${inputClass} resize-y disabled:opacity-40`}
      />
    )
  }

  return (
    <input
      id={id}
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      maxLength={field.kind === 'text' ? field.maxLength : undefined}
      minLength={field.kind === 'text' ? field.minLength : undefined}
      min={field.min}
      max={field.max}
      value={String(value ?? '')}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={`${inputClass} disabled:opacity-40`}
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
  if (field.kind === 'stringList') return Array.isArray(value) ? value.join(', ') : String(value)
  return String(value)
}
