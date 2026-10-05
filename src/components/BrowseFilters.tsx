import Link from 'next/link'
import FilterDisclosure from '@/components/FilterDisclosure'

/**
 * Browse filters for a catalog index.
 *
 * Links rather than a client component: the filter state belongs in the URL so
 * a filtered view can be shared, revisited and returned to with the back
 * button. It also keeps the page it sits on server-rendered.
 *
 * Filters and the sort are separate controls. The sort used to be the first
 * row of chips, styled and labeled like a filter, so the bar read as four ways
 * to narrow the list when one of them narrowed nothing. It now sits with the
 * result count above the grid, where the order of what follows is decided.
 *
 * The chip rows are folded behind a Filters button. Open, they took four rows
 * above the first card on every visit, for a control most visits never touch.
 * What is applied stays visible on the button's line either way.
 */

export interface FilterGroup {
  /** Query parameter this group writes, e.g. "process" or "type". */
  key: string
  /** Shown before the chips, e.g. "Process". */
  label: string
  /** Every value that may appear, in the order they should be shown. */
  values: readonly string[]
  /**
   * What pressing each value would show, with the other filters applied.
   *
   * A value counted at zero is shown but cannot be pressed: hiding it would
   * move every chip after it each time a filter changed.
   */
  counts: Record<string, number>
  /**
   * Reader-facing text for each value, where the stored value is not it.
   *
   * The camera group filters on enum members, so without this the chips read
   * COMPACT and RANGEFINDER. Values with no entry fall back to themselves.
   */
  labels?: Record<string, string>
}

export interface SortControl {
  key: string
  values: readonly string[]
  labels: Record<string, string>
  /** The order in force when the parameter is absent. */
  defaultValue: string
}

export default function BrowseFilters({
  basePath,
  groups,
  sort,
  active,
  shown,
  total,
  noun,
}: {
  /** Where the links point, e.g. "/films". */
  basePath: string
  groups: FilterGroup[]
  sort: SortControl
  /** The currently applied value per parameter, filters and sort alike. */
  active: Record<string, string | undefined>
  /** Records on the page after filtering, and in the catalog before it. */
  shown: number
  total: number
  noun: { one: string; other: string }
}) {
  const keys = [...groups.map(g => g.key), sort.key]
  const href = (changes: Record<string, string>) => {
    const params = new URLSearchParams()
    for (const key of keys) {
      const next = key in changes ? changes[key] : active[key]
      if (next) params.set(key, next)
    }
    const query = params.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  // A group with one option narrows nothing, so it is not a choice worth
  // showing, unless it is applied: every camera is 35mm, and /cameras?format=35mm
  // otherwise kept a filter in force with no chip to show it or take it off.
  const usable = groups.filter(group => group.values.length > 1 || active[group.key])
  const filtered = usable.some(group => active[group.key])
  const currentSort = active[sort.key] ?? sort.defaultValue

  // An applied chip is a state, not an invitation. It was once painted brand
  // red, the color this site reserves for the one action a screen wants from
  // you, so the loudest thing on the page was a filter already applied. Lit
  // the way every other selected control here is lit.
  //
  // shrink-0 so a row that scrolls on a phone keeps each chip whole.
  const chip = 'inline-flex h-8 shrink-0 items-center gap-1.5 border px-3 text-xs transition-colors'

  const appliedGroups = usable.filter(group => active[group.key])

  const toolbar = (
    <>
      {appliedGroups.map(group => {
        const value = active[group.key]!
        const label = group.labels?.[value] ?? value
        return (
          <Link
            key={group.key}
            href={href({ [group.key]: '' })}
            aria-label={`Remove filter ${group.label} ${label}`}
            className={`${chip} border-neutral-700 bg-neutral-900 text-white hover:border-neutral-500`}
          >
            <span className="text-neutral-500">{group.label}</span>
            {label}
            <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5 text-neutral-400">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </Link>
        )
      })}
      {filtered && (
        <Link
          href={href(Object.fromEntries(usable.map(g => [g.key, ''])))}
          className="text-xs text-neutral-500 underline underline-offset-4 hover:text-white"
        >
          Clear all
        </Link>
      )}

      <div className="ml-auto flex items-center gap-4">
        <p className="text-sm text-neutral-400" aria-live="polite">
          {filtered ? `${shown} of ${total} ` : `${total} `}
          {total === 1 ? noun.one : noun.other}
        </p>
        <div className="inline-flex border border-neutral-800" role="group" aria-label="Sort">
          {sort.values.map(value => {
            const isActive = currentSort === value
            return (
              <Link
                key={value}
                // The default order is the absence of the parameter, so the
                // plain URL stays the canonical one.
                href={href({ [sort.key]: value === sort.defaultValue ? '' : value })}
                aria-current={isActive ? 'true' : undefined}
                className={`inline-flex h-8 items-center px-3 text-xs transition-colors ${
                  isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {sort.labels[value] ?? value}
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )

  // Nothing to choose between: the count and the sort, without a button that
  // opens an empty panel.
  if (usable.length === 0) {
    return <div className="mb-8 flex flex-wrap items-center gap-3">{toolbar}</div>
  }

  return (
    <FilterDisclosure applied={appliedGroups.length} toolbar={toolbar}>
      {/*
        One grid rather than a stack of rows, so every group's chips start at
        the same place. `auto` makes the first column as wide as the longest
        label, and the second takes the rest. min-w-0 lets that column shrink
        below its content, which is what allows a row to scroll instead of
        pushing the page wider than the screen.
      */}
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-3">
        {usable.map(group => {
          const current = active[group.key]
          return (
            <div key={group.key} className="contents">
              <span
                id={`filter-${group.key}`}
                className="flex items-center pt-2 text-xs uppercase tracking-widest text-neutral-600 sm:h-8 sm:pt-0"
              >
                {group.label}
              </span>
              {/* On a phone a row scrolls sideways rather than wrapping, so
                  each group stays one line. The negative margin lets it run
                  to the edge of the panel. */}
              <div
                className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
                role="group"
                aria-labelledby={`filter-${group.key}`}
              >
                {group.values.map(value => {
                  const isActive = current === value
                  const count = group.counts[value] ?? 0
                  const label = group.labels?.[value] ?? value

                  if (!isActive && count === 0) {
                    return (
                      <span
                        key={value}
                        aria-disabled="true"
                        title={`No ${noun.other} match this with the other filters applied`}
                        className={`${chip} cursor-default border-neutral-900 text-neutral-700`}
                      >
                        {label}
                        <span>0</span>
                      </span>
                    )
                  }

                  return (
                    <Link
                      key={value}
                      // Pressing the applied chip clears it, so a filter is
                      // undone where it was set.
                      href={href({ [group.key]: isActive ? '' : value })}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={isActive ? `${label}, applied. Remove filter` : undefined}
                      className={`${chip} ${
                        isActive
                          ? 'border-neutral-500 bg-neutral-800 text-white'
                          : 'border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white'
                      }`}
                    >
                      {label}
                      {isActive ? (
                        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5 text-neutral-400">
                          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      ) : (
                        <span className="text-neutral-600">{count}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </FilterDisclosure>
  )
}
