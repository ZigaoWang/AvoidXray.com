import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasFeature } from '@/lib/features'

// The page is a client component and cannot export metadata, and without any
// it inherited the root's index, follow and the homepage's social copy.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * An owner with the library edits a photo in the library's viewer, which has
 * everything this page has and the roll and lab besides. Everyone else, and an
 * admin fixing someone else's photo, keeps this page.
 */
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (userId) {
    const { id } = await params
    const [viewer, photo] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
      prisma.photo.findUnique({ where: { id }, select: { userId: true, kind: true, uploadComplete: true, deletedAt: true } }),
    ])
    if (photo?.userId === userId && photo.kind === 'COMMUNITY' && photo.uploadComplete && !photo.deletedAt && hasFeature(viewer, 'library')) {
      redirect(`/library?photo=${id}`)
    }
  }
  return children
}
