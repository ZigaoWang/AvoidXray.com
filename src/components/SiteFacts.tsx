'use client'

import Link from 'next/link'
import { createContext, useContext } from 'react'

/**
 * Facts about the site the root layout reads once per request, for parts that
 * render on server and client pages alike, such as the footer. A client page
 * cannot query for them itself.
 */
export interface SiteFacts {
  /** Whether the catalog has any lab. */
  labs: boolean
}

const SiteFactsContext = createContext<SiteFacts>({ labs: false })

export function SiteFactsProvider({ facts, children }: { facts: SiteFacts; children: React.ReactNode }) {
  return <SiteFactsContext.Provider value={facts}>{children}</SiteFactsContext.Provider>
}

/** The footer's Labs link, drawn only once there is a lab to list. */
export function LabsFooterLink({ className }: { className: string }) {
  const { labs } = useContext(SiteFactsContext)
  return labs ? <Link href="/labs" className={className}>Labs</Link> : null
}
