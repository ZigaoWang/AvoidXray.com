import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
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
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 md:py-16">
        <PageHeader
          title="Your work"
          description="Select photos to edit their details, add them to an album or export them. Shift-click selects a whole run."
        />

        {/* No Upload link here. The header carries a red Upload button on
            every page, and this tab bar drew a second way to the same place
            beside it. */}
        <div className="flex gap-4 border-b border-neutral-800 mb-8 items-center">
          <span className="py-3 text-sm font-medium text-white border-b-2 border-brand -mb-px">
            Photos
          </span>
          <Link href="/albums" className="py-3 text-sm font-medium text-neutral-500 hover:text-white transition-colors">
            Albums
          </Link>
        </div>

        <ManagePhotos />
      </main>
      <Footer />
    </div>
  )
}
