import { PageSkeleton, PageHeaderSkeleton, FilterChipsSkeleton, GearGridSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:py-16">
        {/* The heading sits opposite an action button, and the pair is followed
            by a filter bar. Neither was here, so the cards arrived roughly a
            hundred and fifty pixels above where the placeholder had put them. */}
        <PageHeaderSkeleton action />
        <FilterChipsSkeleton rows={2} />
        <GearGridSkeleton />
      </div>
    </PageSkeleton>
  )
}
