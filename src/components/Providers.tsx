'use client'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from './ui/Toast'
import { SiteFactsProvider, type SiteFacts } from './SiteFacts'

export default function Providers({ children, facts }: { children: React.ReactNode; facts: SiteFacts }) {
  return (
    // Not refetched on every window focus. Each refetch was a round trip to
    // the server and a database read, for a session that only changes when
    // its own page updates it, which it does through update().
    <SessionProvider refetchOnWindowFocus={false}>
      <ToastProvider>
        <SiteFactsProvider facts={facts}>{children}</SiteFactsProvider>
      </ToastProvider>
    </SessionProvider>
  )
}
