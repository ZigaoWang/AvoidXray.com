import { PageSkeleton, MasonrySkeleton, Bar } from '@/components/ui/Skeleton'

/**
 * One album: back link, the header lines, then the photographs.
 *
 * This route had no boundary of its own, so opening an album showed the
 * *index's* skeleton — its tab row, its Create Album button and six album cards
 * — which then flipped into a header and a masonry. It advertised the wrong
 * page.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-16">
        {/* h-5: the back link is text-sm, which is a 20px line. */}
        <Bar className="mb-6 h-5 w-28" />

        {/* No panel around the header any more: the page opens on bare lines
            like the film and camera pages do, so a border and twelve units of
            padding here would be an edge that vanishes on arrival. */}
        <div className="mb-8">
          {/* The title steps 3xl / 4xl at md, as the other detail pages do. */}
          <Bar className="h-9 w-72 max-w-full md:h-10" />
          {/* The description is optional. Reserved anyway: it is one text-base
              line, and the albums people follow links to are the ones whose
              owners wrote something. */}
          <Bar className="mt-3 h-6 w-full max-w-2xl" delay={160} />

          {/* The byline: a 24px avatar, a name, a handle and the photo count,
              all on one line now rather than in two bordered boxes. The
              avatar is what sets the row's height. */}
          <div className="mt-3 flex items-center gap-2">
            <Bar className="h-6 w-6 rounded-full" delay={320} />
            <Bar className="h-5 w-32" delay={320} />
            <Bar className="h-5 w-20" delay={480} />
            <Bar className="h-4 w-16" delay={480} />
          </div>
          {/* No three-dot menu: it is drawn only for the album's owner, and a
              fallback does not know who is looking. It sits to the right of
              these lines rather than above them, so leaving it out moves
              nothing. */}
        </div>

        {/* The "Photos" heading and its count, which the grid sits under. */}
        <div className="mb-6 flex items-center justify-between">
          <Bar className="h-7 w-28" />
          <Bar className="h-5 w-16" delay={160} />
        </div>
        <MasonrySkeleton count={12} />
      </div>
    </PageSkeleton>
  )
}
