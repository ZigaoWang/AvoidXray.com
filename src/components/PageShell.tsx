import type { ReactNode } from 'react'
import Footer from './Footer'

/**
 * The frame every page sits in: the header, the page, the footer.
 *
 * The header is passed in rather than chosen here. A server page gives
 * `<Header />`, which reads the session before the first paint; a page that is
 * a client component throughout gives `<ClientHeader />`, since a client
 * module cannot import the server one. Both draw the same bar.
 */
export default function PageShell({ header, footer = true, children }: {
  header: ReactNode
  /** Off for the few screens that end without one, such as a full-height viewer. */
  footer?: boolean
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      {header}
      {children}
      {footer && <Footer />}
    </div>
  )
}
