import type { Metadata } from 'next'
import { Suspense } from 'react'
import { requireLibraryPage } from '@/lib/library/access'
import LibraryClient from './LibraryClient'

export const metadata: Metadata = {
  title: 'Library',
  robots: { index: false, follow: false },
}

/** Behind the library feature: anyone without it gets the not-found page. */
export default async function Page() {
  await requireLibraryPage()
  return (
    <Suspense>
      <LibraryClient />
    </Suspense>
  )
}
