import { PageSkeleton, TitleSkeleton, TabsSkeleton, TileGridSkeleton } from '@/components/ui/Skeleton'

/** All / Photos / Users / Cameras / Films, as the page always renders them. */
const TAB_WIDTHS = ['w-8', 'w-14', 'w-12', 'w-16', 'w-12']

export default function Loading() {
  return (
    <PageSkeleton>
      {/* The page's own padding, which is tighter on a phone than the flat
          px-6 py-10 this used to assume. */}
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-16">
        <TitleSkeleton size="3xl" />
        {/* The tab row was missing entirely, so the results jumped down by its
            height the moment they arrived. */}
        <TabsSkeleton widths={TAB_WIDTHS} className="mb-8 overflow-x-auto" />
        {/* Search lists photographs in a fixed 3:2 grid, not a masonry. */}
        <TileGridSkeleton count={12} />
      </div>
    </PageSkeleton>
  )
}
