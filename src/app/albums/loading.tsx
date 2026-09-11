import { PageSkeleton, PageHeaderSkeleton, AlbumGridSkeleton, Bar } from '@/components/ui/Skeleton'

/** The albums half of the same area /manage/loading.tsx covers. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:py-16">
        <PageHeaderSkeleton />

        {/* The tab row carries the Create Album button on its right, so the
            rule under it is taller here than the plain tabs on /manage. */}
        <div className="mb-8 flex items-center gap-4 border-b border-neutral-800" aria-hidden>
          <span className="block border-b-2 border-transparent py-3"><Bar className="h-5 w-14" /></span>
          <span className="block border-b-2 border-transparent py-3"><Bar className="h-5 w-16" /></span>
          <span className="ml-auto pb-1"><Bar className="h-8 w-32" delay={160} /></span>
        </div>

        <AlbumGridSkeleton count={6} />
      </div>
    </PageSkeleton>
  )
}
