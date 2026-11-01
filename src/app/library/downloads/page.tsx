import type { Metadata } from 'next'
import { requireLibraryPage } from '@/lib/library/access'
import Header from '@/components/Header'
import DownloadsClient from './DownloadsClient'

export const metadata: Metadata = {
  title: 'Downloads',
  robots: { index: false, follow: false },
}

export default async function Page() {
  await requireLibraryPage()
  return <DownloadsClient header={<Header />} />
}
