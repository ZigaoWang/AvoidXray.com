import Link from 'next/link'

/**
 * Browse filters for a catalogue index.
 *
 * Links rather than a client component: the filter state belongs in the URL so
 * a filtered view can be shared, revisited and returned to with the back
 * button. It also keeps the page it sits on server-rendered.
 *
 * This was written for the film index and only ever used there, so the camera
 * index — which has exactly the same shape of data in `cameraType` and
 * `format` — had no way to narrow anything at all. One list of every camera on
 * the site, alphabetical, and that was the whole page.
 */

export interface FilterGroup {
  /** Query parameter this group writes, e.g. "process" or "type". */
  key: string
  /** Shown before the chips, e.g. "Process". */
  label: string
  /** Every value that may appear, in the order they should be shown. */
  values: readonly string[]
  /** How many records carry each value, so an empty option can be hidden. */
  counts: Record<string, number>
  /** Whether to show the count on the chip. Off for secondary groups. */
  showCounts?: boolean
  /**
   * Reader-facing text for each value, where the stored value is not it.
   *
   * The camera group filters on enum members, so without this the chips read
   * COMPACT and RANGEFINDER. Values with no entry fall back to themselves,
   * which is what the format group wants.
   */
  labels?: Record<string, string>
}

export default function BrowseFilters({
  basePath,
  groups,
  active,
}: {
  /** Where the links point, e.g. "/films". */
  basePath: string
  groups: FilterGroup[]
  /** The currently applied value per group key. */
  active: Record<string, string | undefined>
}) {
  const href = (key: string, value: string) => {
    const params = new URLSearchParams()
    for (const group of groups) {
      const next = group.key === key ? value : active[group.key]
      if (next) params.set(group.key, next)
    }
    const query = params.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  const chip = (isActive: boolean) =>
    `text-xs px-3 py-1.5 border transition-colors ${
      isActive
        ? 'border-[#D32F2F] bg-[#D32F2F] text-white'
        : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white'
    }`

  // A group with one option narrows nothing, so it is not a choice worth
  // showing. If no group offers a real choice, the whole bar goes.
  const usable = groups
    .map(group => ({ ...group, values: group.values.filter(v => (group.counts[v] ?? 0) > 0) }))
    .filter(group => group.values.length > 1)

  if (usable.length === 0) return null

  return (
    <div className="mb-10 space-y-3">
      {usable.map(group => {
        const current = active[group.key]
        return (
          <div key={group.key} className="flex flex-wrap items-center gap-2">
            {/* The group is named to assistive technology as well as shown,
                and the applied chip carries aria-current — the colour was the
                only thing saying which one was on. */}
            <span id={`filter-${group.key}`} className="mr-1 text-xs uppercase tracking-widest text-neutral-600">
              {group.label}
            </span>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={`filter-${group.key}`}>
              <Link
                href={href(group.key, '')}
                aria-current={!current ? 'true' : undefined}
                className={chip(!current)}
              >
                All
              </Link>
              {group.values.map(value => {
                const isActive = current === value
                return (
                  <Link
                    key={value}
                    // Selecting the applied chip clears it, so a filter can be
                    // undone where it was set.
                    href={href(group.key, isActive ? '' : value)}
                    aria-current={isActive ? 'true' : undefined}
                    className={chip(isActive)}
                  >
                    {group.labels?.[value] ?? value}
                    {group.showCounts !== false && (
                      <span className={isActive ? 'ml-1.5 opacity-70' : 'ml-1.5 text-neutral-600'}>
                        {group.counts[value]}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
