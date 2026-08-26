import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <Skeleton className="h-9 w-52" />
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
          </div>
        </div>
      ))}
    </div>
  )
}
