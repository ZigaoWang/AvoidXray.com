import { PageSkeleton, TitleSkeleton, FilterChipsSkeleton, GearGridSkeleton, Bar } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        {/* The heading sits opposite an action button, and the pair is followed
            by a filter bar. Neither was here, so the cards arrived roughly a
            hundred and fifty pixels above where the placeholder had put them. */}
        <div className="mb-12 flex items-center justify-between gap-4">
          <TitleSkeleton size="4xl" gap="" />
          <Bar className="h-10 w-36 shrink-0" delay={160} />
        </div>
        <FilterChipsSkeleton rows={2} />
        <GearGridSkeleton />
      </div>
    </PageSkeleton>
  )
}
