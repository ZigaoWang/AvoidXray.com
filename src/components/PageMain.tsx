import type { ReactNode } from 'react'

/**
 * The page's own column, inside PageShell: the skip link's target, centered,
 * at one of four widths and the one padding every page shares.
 *
 * Pages wrote this themselves, and it had drifted into ten combinations: nine
 * widths between max-w-md and max-w-7xl, top padding of py-8, py-10 or py-12
 * on a phone, with or without the step up at md. Moving between two pages in
 * the header made the title jump for no reason.
 *
 * - `wide`: grids and anything laid out in columns: indexes, detail pages,
 *   profiles, admin.
 * - `prose`: reading width, for long text and for lists of messages.
 * - `form`: one column of fields: settings, the feedback form.
 * - `narrow`: a single short form or a message with one action.
 *
 * `viewer` is the photo page's tighter top, where the photo is the page and
 * the header above it is already the title.
 */
const WIDTHS = {
  wide: 'max-w-7xl',
  prose: 'max-w-3xl',
  form: 'max-w-xl',
  narrow: 'max-w-md',
} as const

export type PageWidth = keyof typeof WIDTHS

export const pageColumnClass = (width: PageWidth = 'wide') => `mx-auto w-full ${WIDTHS[width]} px-6`
export const pagePaddingClass = 'py-10 md:py-16'

export default function PageMain({ width = 'wide', viewer = false, className = '', children }: {
  width?: PageWidth
  viewer?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`flex-1 outline-none ${pageColumnClass(width)} ${viewer ? 'py-6 md:py-8' : pagePaddingClass} ${className}`}
    >
      {children}
    </main>
  )
}
