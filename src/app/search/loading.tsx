import { PageSkeleton, TitleSkeleton, MasonrySkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <TitleSkeleton />
        <MasonrySkeleton count={12} />
      </div>
    </PageSkeleton>
  )
}
