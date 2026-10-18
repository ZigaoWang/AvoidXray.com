import { toolbarFieldClass } from '@/components/ui/toolbarField'

/**
 * A search box for the photos on one page: a profile, an album, a film or a
 * camera. It opens the site's search page with the scope attached, so a search
 * looks and works the same wherever it starts, and the result can be widened
 * to the whole site from there.
 */
export default function ScopedSearch({
  scope,
  placeholder,
  className = '',
}: {
  /** Query parameters that narrow the search, such as { user: 'mia' } or { film: id }. */
  scope: Record<string, string>
  placeholder: string
  className?: string
}) {
  return (
    <form action="/search" method="get" role="search" className={`relative w-full sm:w-56 ${className}`}>
      {Object.entries(scope).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor={`scoped-search-${Object.values(scope).join('-')}`} className="sr-only">{placeholder}</label>
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {/* The toolbar field, not the form one: this sits beside the sort and
          Filters controls and takes their height. */}
      <input
        id={`scoped-search-${Object.values(scope).join('-')}`}
        name="q"
        type="search"
        required
        autoComplete="off"
        placeholder={placeholder}
        className={toolbarFieldClass('pl-8 pr-2')}
      />
    </form>
  )
}
