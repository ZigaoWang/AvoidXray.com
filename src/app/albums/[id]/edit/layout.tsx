import type { Metadata } from 'next'

// The page is a client component and cannot export metadata, and without any
// it inherited the root's index, follow and the homepage's social copy.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
