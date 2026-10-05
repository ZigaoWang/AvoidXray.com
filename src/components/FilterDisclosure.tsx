'use client'

import { useId, useState, type ReactNode } from 'react'

/**
 * The Filters button and the panel it opens.
 *
 * The only part of the filter bar that needs state. Everything inside is still
 * links rendered on the server, so a filtered view stays a URL. The panel is
 * hidden rather than unmounted, which keeps those links in the page for
 * crawlers, and the open state survives each chip press because the page
 * re-renders around this component instead of replacing it.
 */
export default function FilterDisclosure({
  applied,
  toolbar,
  children,
}: {
  /** How many filters are in force, shown on the button. */
  applied: number
  /** Everything on the button's line: applied chips, the count, the sort. */
  toolbar: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(o => !o)}
          className={`inline-flex h-8 items-center gap-2 border px-3 text-xs transition-colors ${
            open || applied > 0
              ? 'border-neutral-500 text-white'
              : 'border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white'
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Filters
          {applied > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center bg-white px-1 text-[10px] font-medium text-black">
              {applied}
            </span>
          )}
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={`h-2.5 w-2.5 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
        {toolbar}
      </div>

      <div id={panelId} hidden={!open} className="mt-4 border border-neutral-900 p-4">
        {children}
      </div>
    </div>
  )
}
