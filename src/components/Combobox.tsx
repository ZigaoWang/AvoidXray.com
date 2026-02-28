'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'

type Option = {
  id: string
  name: string
  brand?: string | null
  imageUrl?: string | null
}

type Props = {
  options: Option[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  label: string
  onAddNewClick?: () => void
}

export default function Combobox({ options, value, onChange, placeholder, label, onAddNewClick }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isSelectingRef = useRef(false)

  const selected = options.find((o) => o.id === value)

  const getDisplayName = useCallback((o: Option) => (o.brand ? `${o.brand} ${o.name}` : o.name), [])

  // Show all options when query matches selected or is empty, otherwise filter
  const isQueryMatchingSelected = selected && query.toLowerCase() === getDisplayName(selected).toLowerCase()
  const filtered =
    isQueryMatchingSelected || !query
      ? options
      : options.filter((o) => {
          const displayName = getDisplayName(o).toLowerCase()
          const q = query.toLowerCase()
          return displayName.includes(q) || o.name.toLowerCase().includes(q)
        })

  // Sync query with selected value when dropdown closes
  useEffect(() => {
    if (selected && !open) {
      setQuery(getDisplayName(selected))
    }
  }, [selected, open, getDisplayName])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (o: Option) => {
    isSelectingRef.current = true
    onChange(o.id)
    setQuery(getDisplayName(o))
    setOpen(false)
    setTimeout(() => {
      isSelectingRef.current = false
    }, 200)
  }

  const handleBlur = () => {
    setTimeout(() => {
      if (isSelectingRef.current) return

      if (!query.trim()) {
        if (selected) {
          setQuery(getDisplayName(selected))
        }
        setOpen(false)
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
      } else if (selected) {
        setQuery(getDisplayName(selected))
      }

      setOpen(false)
    }, 150)
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">
        {label}
      </label>

      {/* Selected item image indicator */}
      {selected && !open && selected.imageUrl && (
        <div className="absolute left-3 top-[38px] z-10 pointer-events-none">
          <div className="relative w-6 h-6">
            <Image src={selected.imageUrl} alt="" fill className="object-contain" />
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none ${
          selected?.imageUrl && !open ? 'pl-11' : ''
        }`}
      />

      {open && (
        <div className="absolute z-10 w-full mt-1 bg-neutral-900 border border-neutral-800 max-h-64 overflow-auto">
          {/* Add New option */}
          {onAddNewClick && (
            <button
              type="button"
              onMouseDown={() => {
                isSelectingRef.current = true
              }}
              onClick={() => {
                onAddNewClick()
                setOpen(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-[#D32F2F] hover:bg-neutral-800 border-b border-neutral-800 transition-colors"
            >
              + Add New {label}
            </button>
          )}

          {/* Options */}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => {
                isSelectingRef.current = true
              }}
              onClick={() => handleSelect(o)}
              className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors flex items-center gap-2"
            >
              {o.imageUrl && (
                <div className="relative w-8 h-8 flex-shrink-0">
                  <Image src={o.imageUrl} alt="" fill className="object-contain" />
                </div>
              )}
              <span>{getDisplayName(o)}</span>
            </button>
          ))}

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
