import { PageSkeleton, ProfileSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <ProfileSkeleton />
    </PageSkeleton>
  )
}
