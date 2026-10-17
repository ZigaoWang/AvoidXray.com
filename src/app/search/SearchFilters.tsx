'use client'

import { useRouter } from 'next/navigation'
import { fieldClass } from '@/components/ui/Field'
import type { FacetOption, PhotoSort } from '@/lib/photoSearch'

/**
 * Sort and filter the photo results. Each change is a new URL, so a filtered
 * search can be shared and the back button undoes it. Changing anything goes
 * back to the first page.
 *
 * The film and camera lists are what the results contain, with how many each
 * would leave, rather than the whole catalog, so no choice leads to nothing.
 */
export default function SearchFilters({
  params,
  sort,
  film,
  camera,
  films,
  cameras,
}: {
  /** The current search's other parameters, kept when one filter changes. */
  params: Record<string, string>
  sort: PhotoSort
  film?: string
  camera?: string
  films: FacetOption[]
  cameras: FacetOption[]
}) {
  const router = useRouter()

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`/search?${next}`)
  }

  const select = `${fieldClass} h-10 min-w-0 truncate py-0 text-xs sm:text-sm`

  return (
    <div className="mb-6 grid grid-cols-3 gap-2">
      <label className="sr-only" htmlFor="search-sort">Sort</label>
      <select id="search-sort" className={select} value={sort} onChange={e => apply('sort', e.target.value === 'relevant' ? '' : e.target.value)}>
        <option value="relevant">Best match</option>
        <option value="recent">Newest</option>
        <option value="popular">Most liked</option>
      </select>

      <label className="sr-only" htmlFor="search-film">Film stock</label>
      <select id="search-film" className={select} value={film ?? ''} onChange={e => apply('film', e.target.value)} disabled={!films.length && !film}>
        <option value="">Any film stock</option>
        {films.map(f => (
          <option key={f.id} value={f.id}>{f.name} ({f.count})</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="search-camera">Camera</label>
      <select id="search-camera" className={select} value={camera ?? ''} onChange={e => apply('camera', e.target.value)} disabled={!cameras.length && !camera}>
        <option value="">Any camera</option>
        {cameras.map(c => (
          <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
        ))}
      </select>
    </div>
  )
}
