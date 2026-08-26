import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
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
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">Moderation</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Community edits to cameras and film stocks, awaiting review.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-neutral-900 border border-neutral-800 p-4">
          <div className="text-2xl font-black text-white tabular-nums">{totalPending}</div>
          <div className="text-xs text-neutral-500 mt-0.5">Pending</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4">
          <div className="text-2xl font-black text-white tabular-nums">{pendingCount[0]}</div>
          <div className="text-xs text-neutral-500 mt-0.5">Cameras</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4">
          <div className="text-2xl font-black text-white tabular-nums">{pendingCount[1]}</div>
          <div className="text-xs text-neutral-500 mt-0.5">Film stocks</div>
        </div>
      </div>

      <ModerationQueue />
    </div>
  )
}
