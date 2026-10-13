import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { isAdminSession } from '@/lib/admin/auth'
import ModerationQueue from './ModerationQueue'

export default async function ModerationPage() {
  if (!(await isAdminSession())) redirect('/')

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
        <h1 className="text-2xl font-black text-white tracking-tight">Images awaiting review</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Product images proposed for cameras and film stocks.
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
