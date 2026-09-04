import { PageSkeleton, TitleSkeleton, TabsSkeleton, MasonrySkeleton } from '@/components/ui/Skeleton'

/**
 * Random / Recent / Popular.
 *
 * Following is a fourth tab, but only for a signed-in reader, and a loading
 * file cannot read the session. Three is the count every visitor sees, and the
 * row is the right height either way — which is what keeps the grid still.
 */
const TAB_WIDTHS = ['w-14', 'w-14', 'w-16']

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <TitleSkeleton size="3xl" />
        <TabsSkeleton widths={TAB_WIDTHS} className="mb-8" />
        <MasonrySkeleton count={16} />
      </div>
    </PageSkeleton>
  )
}
