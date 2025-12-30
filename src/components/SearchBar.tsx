'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

type SearchResult = {
  photos: { id: string; thumbnailPath: string; caption: string | null }[]
  users: { username: string; name: string | null; avatar: string | null }[]
  cameras: { id: string; name: string; _count: { photos: number } }[]
  films: { id: string; name: string; _count: { photos: number } }[]
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (expanded && inputRef.current) inputRef.current.focus()
  }, [expanded])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=3`)
      if (res.ok) setResults(await res.json())
      setLoading(false)
    }, 300)
  }, [query])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`)
      setOpen(false)
      setExpanded(false)
    }
  }

  const hasResults = results && (results.photos.length || results.users.length || results.cameras.length || results.films.length)

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium hidden md:block"
      >
        Search
      </button>
    )
  }

  return (
    <div ref={ref} className="relative hidden md:block">
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search..."
          className="w-48 lg:w-64 px-3 py-1.5 bg-neutral-900 text-white text-sm border border-neutral-800 focus:border-neutral-600 focus:outline-none placeholder-neutral-600"
        />
      </form>

      {open && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 shadow-xl z-50 max-h-80 overflow-auto">
          {loading ? (
            <div className="px-4 py-3 text-neutral-500 text-sm">Searching...</div>
          ) : hasResults ? (
            <>
              {results.photos.length > 0 && (
                <div className="border-b border-neutral-800">
                  <div className="px-3 py-2 text-neutral-500 text-xs uppercase">Photos</div>
                  {results.photos.map(p => (
                    <Link key={p.id} href={`/photos/${p.id}`} onClick={() => { setOpen(false); setExpanded(false) }} className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-800">
                      <Image src={p.thumbnailPath} alt="" width={32} height={32} className="w-8 h-8 object-cover" />
                      <span className="text-white text-sm truncate">{p.caption || 'Untitled'}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.users.length > 0 && (
                <div className="border-b border-neutral-800">
                  <div className="px-3 py-2 text-neutral-500 text-xs uppercase">Users</div>
                  {results.users.map(u => (
                    <Link key={u.username} href={`/${u.username}`} onClick={() => { setOpen(false); setExpanded(false) }} className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-800">
                      <div className="w-8 h-8 bg-neutral-700 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                        {u.avatar ? <Image src={u.avatar} alt="" width={32} height={32} className="w-full h-full object-cover" /> : (u.name || u.username).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white text-sm">@{u.username}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.cameras.length > 0 && (
                <div className="border-b border-neutral-800">
                  <div className="px-3 py-2 text-neutral-500 text-xs uppercase">Cameras</div>
                  {results.cameras.map(c => (
                    <Link key={c.id} href={`/cameras/${c.id}`} onClick={() => { setOpen(false); setExpanded(false) }} className="block px-3 py-2 hover:bg-neutral-800">
                      <span className="text-white text-sm">{c.name}</span>
                      <span className="text-neutral-500 text-xs ml-2">{c._count.photos} photos</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.films.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-neutral-500 text-xs uppercase">Films</div>
                  {results.films.map(f => (
                    <Link key={f.id} href={`/films/${f.id}`} onClick={() => { setOpen(false); setExpanded(false) }} className="block px-3 py-2 hover:bg-neutral-800">
                      <span className="text-white text-sm">{f.name}</span>
                      <span className="text-neutral-500 text-xs ml-2">{f._count.photos} photos</span>
                    </Link>
                  ))}
                </div>
              )}
              <Link href={`/search?q=${encodeURIComponent(query)}`} onClick={() => { setOpen(false); setExpanded(false) }} className="block px-3 py-2 text-center text-sm text-[#D32F2F] hover:bg-neutral-800 border-t border-neutral-800">
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
