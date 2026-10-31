import { PageSkeleton, PageHeaderSkeleton, GearGridSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:py-16">
        <PageHeaderSkeleton />
        <GearGridSkeleton />
      </div>
    </PageSkeleton>
  )
}
