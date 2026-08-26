import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ManagePhotos from './ManagePhotos'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Your photos',
  robots: { index: false, follow: false },
}

/**
 * The place to work on your own photographs in bulk.
 *
 * Kept deliberately next to Albums rather than becoming a third scattered
 * area: the two tabs here are the whole of "your work", and everything else —
 * uploading, profile settings — stays where it already was.
 */
export default async function ManagePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-black text-white tracking-tight">Your work</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Select photos to change their camera, film, date or visibility together.
            Shift-click to take a whole run at once.
          </p>
        </header>

        <div className="flex gap-4 border-b border-neutral-800 mb-6">
          <span className="py-2 text-sm font-medium text-white border-b-2 border-[#D32F2F] -mb-px">
            Photos
          </span>
          <Link href="/albums" className="py-2 text-sm font-medium text-neutral-500 hover:text-white transition-colors">
            Albums
          </Link>
          <Link href="/upload" className="ml-auto py-2 text-sm font-medium text-neutral-500 hover:text-white transition-colors">
            Upload →
          </Link>
        </div>

        <ManagePhotos />
      </main>
      <Footer />
    </div>
  )
}
