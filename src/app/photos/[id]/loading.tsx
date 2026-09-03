import { PageSkeleton, PhotoSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <PhotoSkeleton />
    </PageSkeleton>
  )
}
