import { PageSkeleton, PageHeaderSkeleton, AlbumGridSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:py-16">
        <PageHeaderSkeleton />
        <AlbumGridSkeleton count={6} />
      </div>
    </PageSkeleton>
  )
}
