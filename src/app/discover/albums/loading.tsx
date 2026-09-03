import { PageSkeleton, TitleSkeleton, GearGridSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        <TitleSkeleton />
        <GearGridSkeleton count={6} />
      </div>
    </PageSkeleton>
  )
}
