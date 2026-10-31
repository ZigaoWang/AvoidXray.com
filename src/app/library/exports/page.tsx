import type { Metadata } from 'next'
import { requireLibraryPage } from '@/lib/library/access'
import Header from '@/components/Header'
import ExportsClient from './ExportsClient'

export const metadata: Metadata = {
  title: 'Exports',
  robots: { index: false, follow: false },
}

export default async function Page() {
  await requireLibraryPage()
  return <ExportsClient header={<Header />} />
}
