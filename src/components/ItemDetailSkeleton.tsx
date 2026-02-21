export default function ItemDetailSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Hero Section Skeleton */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
        <div className="flex flex-col md:flex-row">
          {/* Image Skeleton */}
          <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 flex items-center justify-center p-8 md:p-12">
            <div className="w-full aspect-[4/3] bg-neutral-800"></div>
          </div>

          {/* Info Skeleton */}
          <div className="flex-1 p-6 md:p-8 lg:p-12 flex flex-col justify-between">
            <div>
              {/* Brand */}
              <div className="h-4 w-24 bg-neutral-800 mb-2"></div>
              {/* Title */}
              <div className="h-10 w-3/4 bg-neutral-800 mb-4"></div>
              {/* Stats */}
              <div className="h-6 w-32 bg-neutral-800 mb-6"></div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-3 mb-6 bg-neutral-900/50 p-4 border border-neutral-800">
                <div>
                  <div className="h-3 w-12 bg-neutral-800 mb-2"></div>
                  <div className="h-5 w-20 bg-neutral-800"></div>
                </div>
                <div>
                  <div className="h-3 w-12 bg-neutral-800 mb-2"></div>
                  <div className="h-5 w-20 bg-neutral-800"></div>
                </div>
                <div>
                  <div className="h-3 w-12 bg-neutral-800 mb-2"></div>
                  <div className="h-5 w-20 bg-neutral-800"></div>
                </div>
                <div>
                  <div className="h-3 w-12 bg-neutral-800 mb-2"></div>
                  <div className="h-5 w-16 bg-neutral-800"></div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="h-4 w-full bg-neutral-800"></div>
                <div className="h-4 w-5/6 bg-neutral-800"></div>
                <div className="h-4 w-4/6 bg-neutral-800"></div>
              </div>
            </div>

            {/* Button */}
            <div className="mt-6">
              <div className="h-10 w-32 bg-neutral-800"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Photos Grid Skeleton */}
      <div>
        <div className="h-8 w-48 bg-neutral-800 mb-6"></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-square bg-neutral-800"></div>
          ))}
        </div>
      </div>
    </div>
  )
}
