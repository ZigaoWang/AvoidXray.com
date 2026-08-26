import FeedSkeleton from '@/components/ui/FeedSkeleton'
import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <Skeleton className="h-9 w-40 mb-2" />
      <Skeleton className="h-4 w-56 mb-8" />
      <div className="flex gap-4 border-b border-neutral-800 mb-8 pb-3">
        {['w-16', 'w-16', 'w-16', 'w-20'].map((w, i) => <Skeleton key={i} className={`h-4 ${w}`} />)}
      </div>
      <FeedSkeleton />
    </div>
  )
}
