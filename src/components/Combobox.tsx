'use client'
import { useState, useRef, useEffect } from 'react'

type Option = { id: string; name: string; brand?: string | null }

export default function Combobox({
  options,
  value,
  onChange,
  onCreate,
  placeholder,
  label
}: {
  options: Option[]
  value: string
  onChange: (id: string) => void
  onCreate: (name: string) => Promise<Option>
  placeholder: string
  label: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.id === value)
  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    (o.brand && o.brand.toLowerCase().includes(query.toLowerCase()))
  )
  const exactMatch = options.some(o => o.name.toLowerCase() === query.toLowerCase())

  useEffect(() => {
    if (selected && !open) setQuery(selected.brand ? `${selected.brand} ${selected.name}` : selected.name)
  }, [selected, open])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleCreate = async () => {
    if (!query.trim() || exactMatch) return
    setCreating(true)
    const created = await onCreate(query.trim())
    onChange(created.id)
    setOpen(false)
    setCreating(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-3">{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full p-3 bg-transparent text-white border-b border-neutral-800 focus:border-white focus:outline-none transition-colors"
      />
      {open && (
        <div className="absolute z-10 w-full mt-2 bg-neutral-900 border border-neutral-800 max-h-48 overflow-auto">
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setQuery(o.brand ? `${o.brand} ${o.name}` : o.name); setOpen(false) }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              {o.brand ? `${o.brand} ${o.name}` : o.name}
            </button>
          ))}
          {query && !exactMatch && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-800 hover:text-white border-t border-neutral-800 transition-colors"
            >
              {creating ? 'Adding...' : `+ Add "${query}"`}
            </button>
          )}
          {!query && filtered.length === 0 && (
            <div className="px-3 py-2 text-neutral-600 text-sm">Type to search</div>
          )}
        </div>
      )}
    </div>
  )
}
