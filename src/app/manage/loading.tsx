import { PageSkeleton, PageHeaderSkeleton, TabsSkeleton, ThumbGridSkeleton, Bar } from '@/components/ui/Skeleton'

/**
 * /manage and /albums are two views of one area and said so in their own
 * comments, but only one of them had a placeholder, so moving between the tabs
 * showed a skeleton in one direction and a blank pause in the other.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:py-16">
        <PageHeaderSkeleton />
        <TabsSkeleton widths={['w-14', 'w-16']} className="mb-8" />

        {/* The search field and count, then the filter row above the grid. */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Bar className="h-[38px] min-w-[200px] flex-1" />
          <Bar className="h-4 w-20" delay={80} />
        </div>
        <div className="mb-4 flex flex-wrap gap-1">
          {['w-12', 'w-24', 'w-16', 'w-16'].map((width, i) => (
            // h-[26px] is px-3 py-1.5 around text-xs.
            <Bar key={width} className={`h-[26px] ${width}`} delay={(i % 5) * 160} />
          ))}
        </div>

        <ThumbGridSkeleton />
      </div>
    </PageSkeleton>
  )
}
