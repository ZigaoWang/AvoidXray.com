import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin/auth'
import ModerationQueue from './ModerationQueue'
import PageHeader from '@/components/ui/PageHeader'

export default async function ModerationPage() {
  await requireAdminPage()

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
      <PageHeader title="Images awaiting review" description="Product images proposed for cameras and film stocks." />

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
