import type { Metadata } from 'next'

/**
 * Never indexed. robots.txt already refuses the crawl, but a URL that is
 * merely disallowed can still be listed from a link somewhere else — the
 * directive that actually keeps it out of results is this one.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
