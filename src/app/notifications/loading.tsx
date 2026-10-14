import { PageSkeleton, PageHeaderSkeleton, Bar } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-2xl px-6 py-10 md:py-16">
        <PageHeaderSkeleton />
        <div className="divide-y divide-neutral-800 border border-neutral-800">
          {Array.from({ length: 8 }, (_, i) => (
            // A 36px avatar and two lines, as each row has.
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Bar className="h-9 w-9 rounded-full" delay={(i % 5) * 160} />
              <div className="flex-1 space-y-1.5">
                <Bar className="h-3.5 w-3/5" delay={(i % 5) * 160} />
                <Bar className="h-3 w-20" delay={(i % 5) * 160} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
