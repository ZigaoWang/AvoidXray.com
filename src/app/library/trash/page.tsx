import type { Metadata } from 'next'
import { requireLibraryPage } from '@/lib/library/access'
import Header from '@/components/Header'
import TrashClient from './TrashClient'

export const metadata: Metadata = {
  title: 'Trash',
  robots: { index: false, follow: false },
}

export default async function Page() {
  await requireLibraryPage()
  return <TrashClient header={<Header />} />
}
