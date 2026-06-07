export default function ItemDetailSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Hero Section Skeleton */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 min-h-[200px]"></div>

          {/* Info */}
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div className="h-3 w-16 bg-neutral-800 mb-2"></div>
              <div className="h-8 w-2/3 bg-neutral-800 mb-3"></div>
              {/* Spec pills */}
              <div className="flex gap-2 mb-4">
                <div className="h-5 w-16 bg-neutral-800"></div>
                <div className="h-5 w-12 bg-neutral-800"></div>
                <div className="h-5 w-10 bg-neutral-800"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full bg-neutral-800"></div>
                <div className="h-3 w-5/6 bg-neutral-800"></div>
              </div>
            </div>
            <div className="mt-6 h-9 w-full bg-neutral-800"></div>
          </div>
        </div>
      </div>

      {/* Masonry Skeleton */}
      <div className="h-6 w-32 bg-neutral-800 mb-6"></div>
      <div className="flex gap-4">
        {[...Array(4)].map((_, col) => (
          <div key={col} className="flex-1 flex flex-col gap-4">
            {[...Array(col % 2 === 0 ? 3 : 2)].map((_, i) => (
              <div key={i} className="bg-neutral-800" style={{ aspectRatio: col % 2 === 0 ? '2/3' : '3/2' }}></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
