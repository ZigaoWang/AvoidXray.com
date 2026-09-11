import { PageSkeleton, MasonrySkeleton, Bar } from '@/components/ui/Skeleton'

/**
 * One album: back link, the hero panel, then the photographs.
 *
 * This route had no boundary of its own, so opening an album showed the
 * *index's* skeleton — its tab row, its Create Album button and six album cards
 * — which then flipped into a hero and a masonry. It advertised the wrong page.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-16">
        {/* h-5: the back link is text-sm, which is a 20px line. */}
        <Bar className="mb-6 h-5 w-28" />

        {/* The hero carries the page's own border and padding rather than a
            plain box, because the panel's edge is visible from the first
            frame on the real page too. */}
        <div className="mb-8 border border-neutral-800">
          <div className="p-6 md:p-8 lg:p-12">
            {/* The title steps 3xl / 4xl / 5xl with the breakpoints, and it is
                the tallest thing above the fold, so one fixed height moved
                everything under it by up to twelve pixels on arrival. */}
            <Bar className="mb-4 h-9 w-80 max-w-full md:h-10 lg:h-12" />
            {/* The description is optional. Reserved anyway: it is one
                text-lg line, and the albums people follow links to are the
                ones whose owners wrote something. */}
            <Bar className="mb-6 h-7 w-full max-w-xl" delay={160} />

            {/* The camera icon and "N photos", on one 28px line. */}
            <div className="mb-6 flex items-center gap-2">
              <Bar className="h-5 w-5" delay={320} />
              <Bar className="h-7 w-24" delay={320} />
            </div>

            {/* The owner card: a 40px avatar beside a name and a handle, in a
                bordered box of its own. The avatar is what sets its height. */}
            <div className="inline-flex items-center gap-3 border border-neutral-800 bg-neutral-900/50 p-3">
              <Bar className="h-10 w-10" delay={160} />
              <div className="space-y-1">
                <Bar className="h-5 w-32" delay={320} />
                <Bar className="h-4 w-20" delay={480} />
              </div>
            </div>
            {/* No Edit Album button: it is drawn only for the album's owner,
                and a fallback does not know who is looking. It sits beside
                this column from md up, so leaving it out costs nothing there. */}
          </div>
        </div>

        {/* The "Photos" heading and its count, which the grid sits under. */}
        <div className="mb-6 flex items-center justify-between">
          <Bar className="h-8 w-28" />
          <Bar className="h-5 w-16" delay={160} />
        </div>
        <MasonrySkeleton count={12} />
      </div>
    </PageSkeleton>
  )
}
