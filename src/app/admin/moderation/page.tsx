import { prisma } from '@/lib/db'
import Stat from '@/components/ui/Stat'
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
        <Stat label="Pending" value={totalPending} />
        <Stat label="Cameras" value={pendingCount[0]} />
        <Stat label="Film stocks" value={pendingCount[1]} />
      </div>

      <ModerationQueue />
    </div>
  )
}
