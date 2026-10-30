import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
import ManagePhotos from './ManagePhotos'
import UnderlineTabs from '@/components/ui/UnderlineTabs'
import { loginHref } from '@/lib/loginHref'
import { prisma } from '@/lib/db'
import { hasFeature } from '@/lib/features'

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
  if (!session?.user) redirect(loginHref('/manage'))
  const viewer = await prisma.user.findUnique({ where: { id: (session.user as { id: string }).id }, select: { isAdmin: true } })

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 md:py-16">
        <PageHeader
          title="Your photos"
          // Shift-click is not mentioned: half the people here are on a phone,
          // where it does not exist, and Select all covers the common case.
          description="Select photos to edit their details, add them to an album or export them."
        />

        {/* No Upload link here. The header carries a red Upload button on
            every page, and this tab bar drew a second way to the same place
            beside it. */}
        <UnderlineTabs
          label="Your work"
          tabs={[
            { href: '/manage', label: 'Photos', current: true },
            { href: '/albums', label: 'Albums', current: false },
          ]}
        />

        <ManagePhotos usesTrash={hasFeature(viewer, 'library')} />
      </main>
      <Footer />
    </div>
  )
}
