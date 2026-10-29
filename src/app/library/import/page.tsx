import type { Metadata } from 'next'
import { requireLibraryPage } from '@/lib/library/access'
import ImportPage from './ImportPage'

export const metadata: Metadata = {
  title: 'Import',
  robots: { index: false, follow: false },
}

/** Behind the library feature: anyone without it gets the not-found page. */
export default async function Page() {
  await requireLibraryPage()
  return <ImportPage />
}
