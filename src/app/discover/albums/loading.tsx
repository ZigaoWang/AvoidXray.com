import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <Skeleton className="h-9 w-44 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-neutral-800">
            <Skeleton className="w-full aspect-[4/1]" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
