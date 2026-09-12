import { PageSkeleton, PageHeaderSkeleton, TabsSkeleton, MasonrySkeleton } from '@/components/ui/Skeleton'

/** All / Photos / Albums / Users / Cameras / Films, as the page renders them. */
const TAB_WIDTHS = ['w-8', 'w-14', 'w-14', 'w-12', 'w-16', 'w-12']

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:py-16">
        <PageHeaderSkeleton />
        {/* The tab row was missing entirely, so the results jumped down by its
            height the moment they arrived. */}
        <TabsSkeleton widths={TAB_WIDTHS} className="mb-8 overflow-x-auto" />
        {/* The same masonry as every other feed; search drew its own cropped
            grid until the results and this agreed to stop. */}
        <MasonrySkeleton count={12} />
      </div>
    </PageSkeleton>
  )
}
