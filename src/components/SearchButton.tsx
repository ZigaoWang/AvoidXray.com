'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { focusRing } from '@/components/ui/focus'

/**
 * The header's search: a bar that opens over the header with the keyboard up.
 *
 * It was a link to /search, and a phone does not raise the keyboard for a
 * field that gains focus after a page loads; iOS only does it for focus given
 * in the same tap. So the field is always in the page, out of sight, and the
 * tap focuses it before showing it. Submitting goes to /search, the one search
 * page the rest of the site uses.
 */
export default function SearchButton({ variant }: { variant: 'icon' | 'text' }) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // Closed by a navigation, including the one a search makes.
  const [openedAt, setOpenedAt] = useState(pathname)
  if (open && pathname !== openedAt) {
    setOpen(false)
    setOpenedAt(pathname)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function show() {
    // Focus first, inside the tap, which is what lets a phone raise its keyboard.
    input.current?.focus()
    setOpenedAt(pathname)
    setOpen(true)
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={show}
          aria-label="Search"
          aria-expanded={open}
          className={`grid h-11 w-11 place-items-center text-neutral-400 transition-colors hover:text-white ${focusRing}`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={show}
          aria-expanded={open}
          className={`text-xs uppercase tracking-wide font-medium transition-colors ${
            pathname === '/search' ? 'text-white' : 'text-neutral-400 hover:text-white'
          } ${focusRing}`}
        >
          Search
        </button>
      )}

      <div
        className={`fixed inset-x-0 top-0 z-[60] border-b border-neutral-800 bg-[#0a0a0a] transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
      >
        <form
          role="search"
          action="/search"
          method="get"
          onSubmit={e => {
            e.preventDefault()
            const q = value.trim()
            if (!q) return
            router.push(`/search?${new URLSearchParams({ q })}`)
          }}
          className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3"
        >
          <svg className="h-5 w-5 shrink-0 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={input}
            type="search"
            name="q"
            value={value}
            onChange={e => setValue(e.target.value)}
            tabIndex={open ? 0 : -1}
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search photos, people and gear"
            placeholder="Search photos, people, gear"
            // 16px, so iOS does not zoom the page in when the field is focused.
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-white placeholder-neutral-500 outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
            className={`shrink-0 text-sm text-neutral-400 hover:text-white ${focusRing}`}
          >
            Cancel
          </button>
        </form>
      </div>
      {open && (
        <button
          type="button"
          aria-label="Close search"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[55] cursor-default bg-black/60"
        />
      )}
    </>
  )
}
