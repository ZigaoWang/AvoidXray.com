import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ModerationQueue from './ModerationQueue'

export default async function ModerationPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.isAdmin) redirect('/')

  // Get counts from ModerationSubmission table
  const pendingCount = await Promise.all([
    prisma.moderationSubmission.count({
      where: {
        status: 'pending',
        resourceType: 'camera'
      }
    }),
    prisma.moderationSubmission.count({
      where: {
        status: 'pending',
        resourceType: 'filmstock'
      }
    })
  ])

  const totalPending = pendingCount[0] + pendingCount[1]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-black text-white mb-2">
                Image Moderation Queue
              </h1>
              <p className="text-neutral-500">
                Review and approve camera and film stock images
              </p>
            </div>
            <Link
              href="/admin"
              className="text-sm text-neutral-400 hover:text-white"
            >
              ← Back to Admin Panel
            </Link>
          </div>

          {/* Stats */}
          <div className="bg-neutral-900 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-white">{totalPending}</div>
                <div className="text-neutral-500">Items pending approval</div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-right">
                  <div className="text-xl font-bold text-white">{pendingCount[0]}</div>
                  <div className="text-neutral-500">Cameras</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-white">{pendingCount[1]}</div>
                  <div className="text-neutral-500">Film Stocks</div>
                </div>
              </div>
            </div>
          </div>

          {/* Moderation Queue */}
          <ModerationQueue />
        </div>
      </main>
      <Footer />
    </div>
  )
}
