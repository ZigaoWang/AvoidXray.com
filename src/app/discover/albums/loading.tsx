import { PageSkeleton, TitleSkeleton, AlbumGridSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        {/* text-4xl over mb-12, as the page renders it. */}
        <TitleSkeleton size="4xl" gap="mb-12" />
        <AlbumGridSkeleton count={6} />
      </div>
    </PageSkeleton>
  )
}
