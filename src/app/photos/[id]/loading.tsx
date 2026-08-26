import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <Skeleton className="w-full aspect-[3/2]" />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="pt-4 space-y-2">
            {['w-32', 'w-40', 'w-24'].map((w, i) => <Skeleton key={i} className={`h-3 ${w}`} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
