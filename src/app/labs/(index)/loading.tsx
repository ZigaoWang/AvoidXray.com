import { PageSkeleton, PageHeaderSkeleton, FilterBarSkeleton, GearGridSkeleton } from '@/components/ui/Skeleton'

/** As /cameras, less the add button: labs are added where a roll names one. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:py-16">
        <PageHeaderSkeleton />
        <FilterBarSkeleton />
        <GearGridSkeleton />
      </div>
    </PageSkeleton>
  )
}
