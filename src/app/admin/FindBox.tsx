'use client'

import { usePathname, useSearchParams } from 'next/navigation'

/**
 * One box that finds any record, above every admin page. A plain GET form, so
 * a result is a URL that can be shared or reloaded. On the Find page it holds
 * what was searched for.
 */
export default function FindBox() {
  const onFind = usePathname() === '/admin/find'
  const query = useSearchParams()?.get('q') ?? ''
  return (
    <form action="/admin/find" role="search" className="w-full">
      <input
        key={onFind ? query : ''}
        type="search"
        name="q"
        defaultValue={onFind ? query : ''}
        autoFocus={onFind && !query}
        placeholder="Find by id, link, username or name"
        aria-label="Find a record"
        className="w-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-base text-white placeholder:text-neutral-500
                   focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:text-sm"
      />
    </form>
  )
}
