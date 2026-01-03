'use client'

import { useState, useEffect, useRef } from 'react'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
}

export default function TagInput({ value, onChange }: TagInputProps) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<{ id: string; name: string }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (input.length < 2) {
      setSuggestions([])
      return
    }

    const fetchTags = async () => {
      const res = await fetch('/api/tags')
      if (res.ok) {
        const tags = await res.json()
        const filtered = tags.filter((t: { name: string }) =>
          t.name.includes(input.toLowerCase()) && !value.includes(t.name)
        )
        setSuggestions(filtered.slice(0, 5))
      }
    }

    const timeout = setTimeout(fetchTags, 200)
    return () => clearTimeout(timeout)
  }, [input, value])

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalized && !value.includes(normalized)) {
      onChange([...value, normalized])
    }
    setInput('')
    setShowSuggestions(false)
  }

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const handleBlur = () => {
    if (input.trim()) addTag(input)
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-2 p-3 bg-neutral-900 border border-neutral-800 focus-within:border-[#D32F2F]">
        {value.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-800 text-white text-sm"
          >
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-neutral-500 hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? "Add tags..." : ""}
          className="flex-1 min-w-[100px] bg-transparent text-white text-sm focus:outline-none"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 z-10">
          {suggestions.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => addTag(tag.name)}
              className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-neutral-800"
            >
              #{tag.name}
            </button>
          ))}
        </div>
      )}

      <p className="text-neutral-600 text-xs mt-1">Press Enter or comma to add tags</p>
    </div>
  )
}
