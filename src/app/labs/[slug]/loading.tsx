import { PageSkeleton, GearDetailSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <GearDetailSkeleton />
    </PageSkeleton>
  )
}
