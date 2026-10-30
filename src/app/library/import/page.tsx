import { redirect } from 'next/navigation'
import { requireLibraryPage } from '@/lib/library/access'

/** The library's uploader lives at /upload, the address every Upload link already uses. */
export default async function Page() {
  await requireLibraryPage()
  redirect('/upload')
}
