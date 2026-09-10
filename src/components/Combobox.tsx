'use client'

import { useState, useRef, useEffect, useId } from 'react'
import Image from 'next/image'
import FieldLabel from '@/components/ui/FieldLabel'
import { activeOption, idleOption } from '@/components/ui/focus'
import { filmMatchesQuery } from '@/lib/filmSearch'
import { displayName } from '@/lib/seo/alt'

type Option = {
  id: string
  name: string
  brand?: string | null
  manufacturer?: string | null
  imageUrl?: string | null
  /** Alternate names, so "5219" finds Kodak Vision3 500T. */
  aliases?: string[]
}

type Props = {
  options: Option[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  label: string
  onAddNewClick?: () => void
  disabled?: boolean
}


/**
 * "Kodak Gold 200" from brand and name, without repeating the brand.
 *
 * That is what the comment always said and not what the code did: it joined the
 * two unconditionally, so an option whose name already led with its maker read
 * "Kodak Kodak Gold 200". It only stayed invisible while the brand column was
 * empty on most rows.
 */
function getDisplayName(o: Option): string {
  return displayName(o) ?? o.name
}

/** The alias responsible for a match, when the visible name does not contain the query. */
function matchedAliasFor(option: Option, query: string): string | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  if (getDisplayName(option).toLowerCase().includes(q)) return null
  return option.aliases?.find((a) => a.toLowerCase().includes(q)) ?? null
}

export default function Combobox({ options, value, onChange, placeholder, label, onAddNewClick, disabled = false }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  /** Index into `rows` of the keyboard-highlighted row, or -1 for none. */
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isSelectingRef = useRef(false)
  /**
   * The two deferred callbacks below, so unmount can cancel them.
   *
   * The blur handler waits 150ms and then calls `onChange`. Nothing cancelled
   * it, so blurring the field and immediately closing the dialog still
   * committed a selection a moment later, to a form that had been dismissed.
   */
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    if (selectTimer.current) clearTimeout(selectTimer.current)
  }, [])
  const listId = useId()

  const selected = options.find((o) => o.id === value)


  // Show all options when query matches selected or is empty, otherwise filter
  const isQueryMatchingSelected = selected && query.toLowerCase() === getDisplayName(selected).toLowerCase()
  const filtered =
    isQueryMatchingSelected || !query
      ? options
      : options.filter(
          (o) => filmMatchesQuery(o, query) || getDisplayName(o).toLowerCase().includes(query.toLowerCase())
        )
  const inputValue = open ? query : (selected ? getDisplayName(selected) : query)

  /**
   * Follow the selection when the parent changes it.
   *
   * `value` is the source of truth and the parent can change it underneath
   * this component: the upload form swaps between one photo's metadata and the
   * batch default when you press "All photos", and the batch default is often
   * empty. `query` still held whatever was last typed, and a closed input with
   * nothing selected falls back to it, so the Camera field went on naming a
   * body that was not going to be saved.
   *
   * Guarded on the value actually changing, so text somebody typed and then
   * clicked away from without choosing anything is left alone.
   */
  const lastValue = useRef(value)
  useEffect(() => {
    if (lastValue.current === value) return
    lastValue.current = value
    setQuery(selected ? getDisplayName(selected) : '')
  }, [value, selected])

  // "Add new" is a row like any other so one index walks the whole dropdown and
  // the keyboard can reach it. It is the first row on screen, so it is first here.
  type Row = { kind: 'add' } | { kind: 'option'; option: Option }
  const rows: Row[] = [
    ...(onAddNewClick ? [{ kind: 'add' } as Row] : []),
    ...filtered.map((option) => ({ kind: 'option', option }) as Row),
  ]
  const rowId = (index: number) => `${listId}-row-${index}`
  // Derived from listId so the pair cannot drift. Without an id here the
  // label was a <label> pointing at nothing, so "Camera" and "Film stock"
  // on the upload form were visible text next to an unnamed combobox: a
  // screen reader announced the role and the value and never the question.
  const inputId = `${listId}-input`

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActive(-1)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Nothing is highlighted until an arrow key asks for it, so Enter on a typed
  // name still falls through to the exact-match handling rather than picking
  // whatever happened to sort first. Retyping drops the highlight, because the
  // row it pointed at is not the row now under that index.
  useEffect(() => { setActive(-1) }, [query])

  // Keep the highlighted row on screen when arrowing past the visible edge.
  useEffect(() => {
    if (active < 0) return
    listRef.current?.querySelector(`#${CSS.escape(rowId(active))}`)?.scrollIntoView({ block: 'nearest' })
    // rowId is derived from listId, which is stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const close = () => {
    setOpen(false)
    setActive(-1)
  }

  /**
   * A row's mousedown raises `isSelectingRef` so the blur it causes cannot
   * commit something else while the click is still on its way. Every path that
   * raises it has to lower it again: choosing "Add New" never did, so the flag
   * stayed raised for the life of the field and every later blur was skipped,
   * leaving unmatched text on screen.
   */
  const releaseSelecting = () => {
    selectTimer.current = setTimeout(() => {
      isSelectingRef.current = false
    }, 200)
  }

  const handleSelect = (o: Option) => {
    isSelectingRef.current = true
    onChange(o.id)
    setQuery(getDisplayName(o))
    close()
    releaseSelecting()
  }

  const chooseRow = (row: Row) => {
    if (row.kind === 'add') {
      onAddNewClick?.()
      close()
      releaseSelecting()
      return
    }
    handleSelect(row.option)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length === 0) return
      if (!open) {
        // Opening and highlighting together, so one press reaches the first row.
        setOpen(true)
        setActive(e.key === 'ArrowDown' ? 0 : rows.length - 1)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      // Wraps, so holding one arrow key cannot strand the highlight at an end.
      setActive((current) => (current + step + rows.length) % rows.length)
      return
    }

    if (e.key === 'Enter') {
      if (!open) return
      // Always swallowed while the list is open: this sits inside the upload
      // form, where a stray Enter would submit a half-filled photograph.
      e.preventDefault()
      if (active >= 0 && rows[active]) { chooseRow(rows[active]); return }
      // No highlight, but the query narrowed to exactly one film — take it,
      // which is what blurring the field already does.
      if (query.trim() && filtered.length === 1) handleSelect(filtered[0])
      return
    }

    if (e.key === 'Escape') {
      if (!open) return
      // Closes the dropdown only. Without this the keypress carries on to the
      // dialog this can be rendered inside and shuts the whole form.
      e.preventDefault()
      e.stopPropagation()
      close()
      setQuery(selected ? getDisplayName(selected) : '')
      return
    }

    // Tab leaves the field; the list must not be left hanging over the page.
    if (e.key === 'Tab') close()
  }

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => {
      if (isSelectingRef.current) return

      if (!query.trim()) {
        close()
        return
      }

      // Auto-select exact match
      const match = options.find((o) => {
        const displayName = getDisplayName(o).toLowerCase()
        const q = query.toLowerCase()
        return o.name.toLowerCase() === q || displayName === q
      })

      if (match) {
        onChange(match.id)
        setQuery(getDisplayName(match))
      } else if (filtered.length === 1) {
        onChange(filtered[0].id)
        setQuery(getDisplayName(filtered[0]))
      } else {
        // Text that matched nothing was never a selection, and leaving it in
        // the field reads as one: the form said "Portra 401" while it was
        // about to save whatever the field held before, or nothing at all.
        // So show what is actually selected, and empty when that is nothing,
        // which is a real answer here for a camera or a film stock.
        setQuery(selected ? getDisplayName(selected) : '')
      }

      close()
    }, 150)
  }

  return (
    <div ref={containerRef} className="relative">
      <FieldLabel htmlFor={inputId}>
        {label}
      </FieldLabel>

      {/* Selected item image indicator */}
      {selected && !open && selected.imageUrl && (
        <div className="absolute left-3 top-[38px] z-10 pointer-events-none">
          <div className="relative w-6 h-6">
            <Image src={selected.imageUrl} alt="" fill className="object-contain" sizes="24px" />
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open && !disabled}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? rowId(active) : undefined}
        autoComplete="off"
        onKeyDown={handleKeyDown}
        value={inputValue}
        onChange={(e) => {
          if (disabled) return
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (disabled) return
          if (selected) {
            setQuery(getDisplayName(selected))
          }
          setOpen(true)
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-brand focus:outline-none ${
          selected?.imageUrl && !open ? 'pl-11' : ''
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      />

      {open && !disabled && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-50 w-full mt-1 bg-neutral-900 border border-neutral-800 max-h-64 overflow-auto"
        >
          {rows.map((row, index) => {
            const highlighted = index === active
            // Rows are driven from the input, which keeps the highlight and the
            // announced option in one place. Tabbing into the list would blur
            // the input and close the dropdown out from under the focus.
            const shared = {
              id: rowId(index),
              type: 'button' as const,
              role: 'option',
              tabIndex: -1,
              'aria-selected': highlighted,
              onMouseEnter: () => setActive(index),
              onMouseDown: () => { isSelectingRef.current = true },
            }

            if (row.kind === 'add') {
              return (
                <button
                  {...shared}
                  key="add-new"
                  onClick={() => chooseRow(row)}
                  className={`w-full px-3 py-2 text-left text-sm text-brand border-b border-neutral-800 transition-colors ${
                    highlighted ? activeOption : idleOption
                  }`}
                >
                  + Add New {label}
                </button>
              )
            }

            const o = row.option
            const alias = matchedAliasFor(o, query)
            return (
              <button
                {...shared}
                key={o.id}
                onClick={() => handleSelect(o)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                  highlighted ? `${activeOption} text-white` : `${idleOption} text-neutral-300`
                }`}
              >
                {o.imageUrl && (
                  <div className="relative w-8 h-8 flex-shrink-0">
                    <Image src={o.imageUrl} alt="" fill className="object-contain" sizes="32px" />
                  </div>
                )}
                <span className="min-w-0">
                  <span className="block truncate">{getDisplayName(o)}</span>
                  {/* Shown only when the alias is what matched, so the row
                      explains itself instead of looking like a stray result. */}
                  {alias && <span className="block truncate text-xs text-neutral-500">{alias}</span>}
                </span>
              </button>
            )
          })}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-neutral-600 text-sm">
              {query ? 'No matches found' : 'Type to search'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
