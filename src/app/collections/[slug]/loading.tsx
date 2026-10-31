import { PageSkeleton, MasonrySkeleton, Bar } from '@/components/ui/Skeleton'

/** One collection: back link, its name and credit, then the photographs. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-16">
        <Bar className="mb-6 h-5 w-28" />
        <div className="mb-8">
          <Bar className="h-8 w-72 max-w-full md:h-9" />
          <Bar className="mt-3 h-5 w-80 max-w-full" delay={160} />
          <div className="mt-3 flex items-center gap-2">
            <Bar className="h-6 w-6" delay={320} />
            <Bar className="h-5 w-32" delay={320} />
          </div>
        </div>
        <div className="mb-6 flex items-center justify-between">
          <Bar className="h-7 w-28" />
          <Bar className="h-5 w-16" delay={160} />
        </div>
        <MasonrySkeleton count={12} />
      </div>
    </PageSkeleton>
  )
}
