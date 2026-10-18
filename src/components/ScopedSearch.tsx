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
      {/* Not the form field: this sits in a toolbar row beside the sort and
          Filters controls, so it takes their height (h-8 buttons inside a
          1px border) and their neutral-800 border. At the form height it
          stood a step taller than the row. The font stays text-base on
          phones, since iOS zooms into any input under 16px. */}
      <input
        id={`scoped-search-${Object.values(scope).join('-')}`}
        name="q"
        type="search"
        required
        autoComplete="off"
        placeholder={placeholder}
        className="h-[34px] w-full border border-neutral-800 bg-transparent pl-8 pr-2 text-base text-white placeholder:text-neutral-500 transition-colors hover:border-neutral-700 focus:border-neutral-500 focus:outline-none sm:text-xs"
      />
    </form>
  )
}
