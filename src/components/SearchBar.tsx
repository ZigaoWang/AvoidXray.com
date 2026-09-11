'use client'
import { useState, useRef, useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { canonicalCameraPath, canonicalFilmPath } from '@/lib/seo/slug'
import { displayName } from '@/lib/seo/alt'
import { activeOption, focusRing, idleOption } from '@/components/ui/focus'

type SearchResult = {
  photos: { id: string; thumbnailPath: string; caption: string | null }[]
  users: { username: string; name: string | null; avatar: string | null }[]
  cameras: { id: string; slug: string | null; name: string; brand: string | null; _count: { photos: number } }[]
  films: { id: string; slug: string | null; name: string; brand: string | null; _count: { photos: number } }[]
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [open, setOpen] = useState(false)
  /** Index into `rowHrefs` of the keyboard-highlighted row, or -1 for none. */
  const [active, setActive] = useState(-1)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const listId = useId()
  const rowId = (index: number) => `${listId}-row-${index}`

  const trimmedQuery = query.trim()

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setActive(-1)
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (expanded && inputRef.current) inputRef.current.focus()
  }, [expanded])

  // A new query and a new response both renumber the rows, so a highlight held
  // over from the previous list would point at whatever now sits at that index.
  useEffect(() => { setActive(-1) }, [trimmedQuery, results])

  // Keep the highlighted row on screen when arrowing past the visible edge.
  useEffect(() => {
    if (active < 0) return
    listRef.current?.querySelector(`#${CSS.escape(rowId(active))}`)?.scrollIntoView({ block: 'nearest' })
    // rowId is derived from listId, which is stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Clearing the box used to clear `results` synchronously from this effect,
  // which cost a render just to throw the list away. The dropdown only opens
  // for a non-empty query, so the stale results are simply not read.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!trimmedQuery) return

    // Aborted when the query changes again. Without this, two searches in
    // flight resolved in whatever order the network returned them, so a slow
    // response to an earlier query could land on top of the results for what
    // was actually typed.
    const controller = new AbortController()

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setFailed(false)
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=3`,
          { signal: controller.signal }
        )
        if (!res.ok) throw new Error()
        setResults(await res.json())
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return
        // A failed request used to reject out of this callback with `loading`
        // still true, so the dropdown read "Searching…" for the rest of the
        // visit and nothing would ever replace it.
        setResults(null)
        setFailed(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)

    return () => controller.abort()
  }, [trimmedQuery])

  // Every dismissal drops the highlight too, or the box reopens with a row
  // highlighted that the user never chose.
  const closeList = () => {
    setOpen(false)
    setActive(-1)
  }

  const closeAll = () => {
    closeList()
    setExpanded(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`)
      closeAll()
    }
  }

  const hasResults = trimmedQuery && results && (results.photos.length || results.users.length || results.cameras.length || results.films.length)

  // The panel is drawn in sections, but the keyboard walks it as one list: every
  // destination in the order it appears, ending with the link to the full
  // results page. Each rendered row finds its index from the offsets below.
  const rowHrefs: string[] = hasResults
    ? [
        ...results.photos.map(p => `/photos/${p.id}`),
        ...results.users.map(u => `/${u.username}`),
        ...results.cameras.map(c => canonicalCameraPath(c)),
        ...results.films.map(f => canonicalFilmPath(f)),
        `/search?q=${encodeURIComponent(query)}`,
      ]
    : []
  const userBase = results?.photos.length ?? 0
  const cameraBase = userBase + (results?.users.length ?? 0)
  const filmBase = cameraBase + (results?.cameras.length ?? 0)
  const viewAllIndex = rowHrefs.length - 1

  // Rows are driven from the input, which keeps the highlight and the announced
  // option in one place. Tabbing into the list would blur the input and close
  // the panel out from under the focus.
  const optionProps = (index: number, className: string) => ({
    id: rowId(index),
    role: 'option',
    'aria-selected': active === index,
    tabIndex: -1,
    className: `${className} ${active === index ? activeOption : idleOption}`,
    onClick: closeAll,
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (rowHrefs.length === 0) return
      e.preventDefault()
      if (!open) {
        // Opening and highlighting together, so one press reaches the first row.
        setOpen(true)
        setActive(e.key === 'ArrowDown' ? 0 : rowHrefs.length - 1)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      // Wraps, so holding one arrow key cannot strand the highlight at an end.
      setActive(current => (current + step + rowHrefs.length) % rowHrefs.length)
      return
    }

    if (e.key === 'Enter') {
      // A highlighted suggestion is what the user aimed at, so it takes the
      // keypress instead of the form's jump to the full results page.
      const href = open && active >= 0 ? rowHrefs[active] : undefined
      if (!href) return
      e.preventDefault()
      router.push(href)
      closeAll()
      return
    }

    // Escape gives the header back rather than leaving an expanded box and an
    // open panel with no obvious way to dismiss them.
    if (e.key === 'Escape') {
      if (open) closeList()
      else { setExpanded(false); setQuery('') }
      return
    }

    // Tab leaves the field; the list must not be left hanging over the page.
    if (e.key === 'Tab') closeList()
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className={`hidden text-xs font-medium uppercase tracking-wide text-neutral-400 transition-colors
                    hover:text-white md:block ${focusRing}`}
      >
        Search
      </button>
    )
  }

  return (
    <div ref={ref} className="relative hidden md:block">
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor="header-search" className="sr-only">
          Search photos, people and gear
        </label>
        <input
          id="header-search"
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={Boolean(open && trimmedQuery)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? rowId(active) : undefined}
          autoComplete="off"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
          className="w-48 lg:w-64 px-3 h-8 bg-neutral-900 text-white text-sm border border-neutral-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand placeholder-neutral-600 animate-expand-in"
        />
      </form>

      {open && trimmedQuery && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 shadow-xl z-50 max-h-80 overflow-auto"
        >
          {loading ? (
            <div className="px-4 py-3 text-neutral-500 text-sm">Searching…</div>
          ) : failed ? (
            <div className="px-4 py-3 text-neutral-500 text-sm">
              Search is unavailable just now. Press Enter to try the full search.
            </div>
          ) : hasResults ? (
            <>
              {results.photos.length > 0 && (
                <div role="group" aria-labelledby={`${listId}-photos`} className="border-b border-neutral-800">
                  <div id={`${listId}-photos`} className="px-3 py-2 text-neutral-500 text-xs uppercase">Photos</div>
                  {results.photos.map((p, i) => (
                    <Link key={p.id} href={`/photos/${p.id}`} {...optionProps(i, 'flex items-center gap-3 px-3 py-2 hover:bg-neutral-800')}>
                      <Image src={p.thumbnailPath} alt="" width={32} height={32} className="w-8 h-8 object-cover" />
                      <span className="text-white text-sm truncate">{p.caption || 'Untitled'}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.users.length > 0 && (
                <div role="group" aria-labelledby={`${listId}-users`} className="border-b border-neutral-800">
                  <div id={`${listId}-users`} className="px-3 py-2 text-neutral-500 text-xs uppercase">Users</div>
                  {results.users.map((u, i) => (
                    <Link key={u.username} href={`/${u.username}`} {...optionProps(userBase + i, 'flex items-center gap-3 px-3 py-2 hover:bg-neutral-800')}>
                      <div className="w-8 h-8 bg-neutral-700 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                        {u.avatar ? <Image src={u.avatar} alt={`${u.name || u.username} avatar`} width={32} height={32} className="w-full h-full object-cover" /> : (u.name || u.username).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white text-sm">@{u.username}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.cameras.length > 0 && (
                <div role="group" aria-labelledby={`${listId}-cameras`} className="border-b border-neutral-800">
                  <div id={`${listId}-cameras`} className="px-3 py-2 text-neutral-500 text-xs uppercase">Cameras</div>
                  {results.cameras.map((c, i) => (
                    <Link key={c.id} href={canonicalCameraPath(c)} {...optionProps(cameraBase + i, 'block px-3 py-2 hover:bg-neutral-800')}>
                      <span className="text-white text-sm">{displayName(c) ?? c.name}</span>
                      <span className="text-neutral-500 text-xs ml-2">{c._count.photos} photos</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.films.length > 0 && (
                <div role="group" aria-labelledby={`${listId}-films`}>
                  <div id={`${listId}-films`} className="px-3 py-2 text-neutral-500 text-xs uppercase">Films</div>
                  {results.films.map((f, i) => (
                    <Link key={f.id} href={canonicalFilmPath(f)} {...optionProps(filmBase + i, 'block px-3 py-2 hover:bg-neutral-800')}>
                      <span className="text-white text-sm">{displayName(f) ?? f.name}</span>
                      <span className="text-neutral-500 text-xs ml-2">{f._count.photos} photos</span>
                    </Link>
                  ))}
                </div>
              )}
              <Link
                href={`/search?q=${encodeURIComponent(query)}`}
                {...optionProps(viewAllIndex, 'block px-3 py-2 text-center text-sm text-brand hover:bg-neutral-800 border-t border-neutral-800')}
              >
                View all results
              </Link>
            </>
          ) : (
            <div className="px-4 py-3 text-neutral-500 text-sm">No results found</div>
          )}
        </div>
      )}
    </div>
  )
}
