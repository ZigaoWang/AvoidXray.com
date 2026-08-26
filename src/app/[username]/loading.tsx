import FeedSkeleton from '@/components/ui/FeedSkeleton'
import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div>
      <div className="border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col sm:flex-row gap-8">
          <Skeleton className="w-28 h-28 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="flex gap-6 pt-2">
              {['w-20', 'w-24', 'w-24'].map((w, i) => <Skeleton key={i} className={`h-4 ${w}`} />)}
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <FeedSkeleton />
      </div>
    </div>
  )
}
