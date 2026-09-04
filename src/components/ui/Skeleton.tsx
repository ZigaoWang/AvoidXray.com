import Image from 'next/image'
import { PRIMARY_NAV } from '@/lib/nav'

/**
 * The placeholders a route shows while its server component is still running.
 *
 * Every page here is `force-dynamic` and renders on demand, and none of them
 * had a loading state — so following a link did nothing visible at all until
 * the server answered. Measured against production that was 2.5s on /explore
 * and 1.5s on the homepage, during which the browser sits on the *previous*
 * page with no indication that anything was happening. People press the link
 * again.
 *
 * A Suspense fallback may not itself suspend, so these cannot render the real
 * <Header />, which reads the session. The bar below is a static replica at the
 * same height, carrying the same logo and links, so the chrome does not appear
 * to vanish and come back. Only the account corner, which is the part that
 * genuinely is not known yet, is left blank.
 */

/**
 * One placeholder block. `animate-skeleton` is defined in globals.css.
 *
 * `delay` offsets the fade so a grid of these drifts rather than pulsing in
 * unison — a whole page blinking on one beat is the thing that reads as a
 * loading screen instead of as the page arriving. Kept under a second so
 * nothing sits obviously still.
 */
export function Bar({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={`animate-skeleton ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  )
}

function HeaderShell() {
  return (
    // Same status-bar padding as the real header, or the chrome jumps
    // down by the notch height the moment the page swaps in.
    <header className="sticky top-0 z-40 bg-[#0a0a0a] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <Image src="/logo.svg" alt="" width={160} height={32} priority />
        <nav className="hidden items-center gap-6 md:flex" aria-hidden>
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Search</span>
          {PRIMARY_NAV.map(item => (
            <span key={item.href} className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              {item.label}
            </span>
          ))}
        </nav>
      </div>
    </header>
  )
}

/**
 * The frame every skeleton below sits in. `aria-busy` and the live region say
 * that something is coming, so this is not silence for a screen reader either.
 */
export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0a]">
      <HeaderShell />
      <main className="flex-1" aria-busy="true">
        <span className="sr-only" role="status">
          Loading
        </span>
        {children}
      </main>
    </div>
  )
}

/**
 * Page title and subtitle, at the size the page actually renders them.
 *
 * The heading is `text-3xl` on the feed pages and `text-4xl` on the browse
 * pages, and the gap below the pair differs too. One fixed size stood in for
 * both, so whichever page did not match it shifted everything underneath by the
 * difference the moment it loaded.
 */
export function TitleSkeleton({
  size = '3xl',
  gap = 'mb-8',
}: {
  /** Matches the page's `text-3xl` or `text-4xl` heading. */
  size?: '3xl' | '4xl'
  /** The page's own margin below the title block. */
  gap?: string
}) {
  return (
    <div className={gap}>
      {/* h-9 and h-10 are the line heights of text-3xl and text-4xl. */}
      <Bar className={`mb-2 ${size === '4xl' ? 'h-10 w-64' : 'h-9 w-56'}`} />
      {/* h-6, because the subtitle is body text rather than a 16px rule. */}
      <Bar className="h-6 w-72 max-w-full" />
    </div>
  )
}

/**
 * A row of tabs on its rule, boxed exactly as the real links are.
 *
 * The padding and the transparent bottom border are copied rather than
 * approximated: a bar with its own margins came out ~18px shorter than the
 * navigation it replaced, which is a visible jump on a page whose whole content
 * sits below it.
 */
export function TabsSkeleton({
  widths,
  className = '',
  padding = 'py-3',
}: {
  widths: readonly string[]
  className?: string
  /** The vertical padding on the real tab links. */
  padding?: string
}) {
  return (
    <div className={`flex gap-4 border-b border-neutral-800 ${className}`} aria-hidden>
      {widths.map((width, i) => (
        <span key={i} className={`block border-b-2 border-transparent ${padding}`}>
          <Bar className={`h-5 ${width}`} />
        </span>
      ))}
    </div>
  )
}

/**
 * The filter chips the browse pages carry between their title and their grid.
 *
 * Omitted entirely before, so /cameras and /films loaded a title, a grid, and
 * then pushed the grid down by the height of a filter bar that had been there
 * all along.
 */
export function FilterChipsSkeleton({ rows = 2 }: { rows?: number }) {
  // Chip widths repeat rather than randomise, so the markup is identical on the
  // server and the client.
  const widths = ['w-16', 'w-20', 'w-14', 'w-24', 'w-16', 'w-20']

  return (
    <div className="mb-10 space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex flex-wrap items-center gap-2">
          <Bar className="h-4 w-14" delay={row * 160} />
          {widths.map((width, i) => (
            // h-[30px] is px-3 py-1.5 around text-xs, plus the chip's border.
            <Bar key={i} className={`h-[30px] ${width}`} delay={((row + i) % 5) * 160} />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A uniform grid of tiles, as the search results render photographs.
 *
 * Search is the one photo listing on the site that is not a masonry — it is a
 * fixed 3:2 grid — so it needs its own placeholder rather than the masonry one,
 * which laid out columns of mixed heights that nothing on the page ever
 * matched.
 */
export function TileGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Bar key={i} className="aspect-[3/2]" delay={(i % 5) * 160} />
      ))}
    </div>
  )
}

/**
 * A masonry of photographs, in the same columns and the same gap the real grid
 * uses, so the swap when the photos arrive is a change of content rather than a
 * change of layout.
 *
 * The breakpoints below are MasonryGrid's own — it measures `innerWidth` and
 * lays out 2 columns under 640px, 3 under 1024 and 4 above. This showed 1, 2
 * and 4 instead, which meant that on a phone the placeholder was a single
 * column of very large tiles and the photographs that replaced it were two
 * columns of small ones, and on a tablet every tile shrank by a third. Only the
 * desktop case ever looked right, which is why it read as intermittent.
 *
 * Keep these in step with `updateColumns` in components/MasonryGrid.tsx.
 */
export function MasonrySkeleton({ count = 12 }: { count?: number }) {
  // Fixed, repeating aspect ratios rather than random ones: a skeleton must
  // render identically on the server and the client.
  const ratios = ['aspect-[3/4]', 'aspect-[4/3]', 'aspect-square', 'aspect-[2/3]']
  // The two extra columns appear at exactly the widths the real grid adds them.
  const visibility = ['', '', 'hidden sm:flex', 'hidden lg:flex']

  return (
    <div className="flex gap-4">
      {visibility.map((className, col) => (
        <div key={col} className={`flex flex-1 flex-col gap-4 ${className}`}>
          {Array.from({ length: Math.ceil(count / visibility.length) }).map((_, row) => (
            <Bar
              key={row}
              className={ratios[(col + row) % ratios.length]}
              delay={((col * 3 + row) % 5) * 160}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** The film and camera cards: a four-up photo strip over a name and count. */
export function GearGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-neutral-800 bg-neutral-900">
          <div className="grid grid-cols-4 gap-px bg-neutral-800">
            {Array.from({ length: 4 }).map((_, j) => (
              <Bar key={j} className="aspect-square" delay={((i + j) % 5) * 160} />
            ))}
          </div>
          <div className="flex items-center gap-4 p-4">
            <Bar className="h-24 w-32 flex-shrink-0" delay={(i % 5) * 160} />
            <div className="min-w-0 flex-1">
              <Bar className="mb-2 h-5 w-40" delay={(i % 5) * 160} />
              <Bar className="h-4 w-24" delay={(i % 5) * 160 + 80} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The album cards: the same four-up strip, over a name, a count and an owner.
 *
 * Shares the strip with the gear cards but not the body — an album card carries
 * stacked text and a byline where a camera card carries a product photograph
 * beside its name, and standing one in for the other put the cards about twenty
 * pixels out.
 */
export function AlbumGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-neutral-800 bg-neutral-900">
          <div className="grid grid-cols-4 gap-px bg-neutral-800">
            {Array.from({ length: 4 }).map((_, j) => (
              <Bar key={j} className="aspect-square" delay={((i + j) % 5) * 160} />
            ))}
          </div>
          <div className="p-4 pb-2">
            {/* h-7 is the line height of the text-lg title. */}
            <Bar className="h-7 w-48 max-w-full" delay={(i % 5) * 160} />
            <Bar className="mt-1 h-5 w-20" delay={(i % 5) * 160 + 80} />
          </div>
          <div className="flex items-center gap-2 px-4 pb-4">
            <Bar className="h-5 w-5 rounded-full" delay={(i % 5) * 160} />
            <Bar className="h-5 w-24" delay={(i % 5) * 160 + 80} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The photo page: the frame itself, then the column of panels beside it.
 *
 * The aspect ratio is a guess, so the real photograph will resize the box when
 * it arrives. That is still better than the alternative, which was the grid
 * you came from sitting frozen for half a second with nothing to say.
 */
export function PhotoSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-col gap-6 lg:flex-row md:gap-8">
        <div className="lg:flex-1">
          <div className="border border-neutral-800">
            <Bar className="aspect-[3/2] w-full" />
            <div className="flex items-center justify-between border-t border-neutral-800 bg-neutral-900 px-4 py-3">
              <Bar className="h-4 w-20" />
              <Bar className="h-4 w-16" delay={160} />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Bar className="h-24" />
            <Bar className="h-24" delay={160} />
          </div>
        </div>
        <div className="space-y-6 lg:w-80">
          <Bar className="h-24" />
          <Bar className="h-32" delay={160} />
          <Bar className="h-40" delay={320} />
        </div>
      </div>
    </div>
  )
}

/** A profile: the header block, the tab bar, then the grid. */
export function ProfileSkeleton() {
  return (
    <>
      <div className="border-b border-neutral-900">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
            <Bar className="h-28 w-28 shrink-0 sm:h-36 sm:w-36" />
            <div className="min-w-0 flex-1 space-y-4">
              <Bar className="h-8 w-56" delay={160} />
              <Bar className="h-4 w-80 max-w-full" delay={320} />
              <div className="flex gap-6">
                <Bar className="h-5 w-20" delay={160} />
                <Bar className="h-5 w-24" delay={320} />
                <Bar className="h-5 w-20" delay={480} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ProfileTabs pads its links py-3.5 px-4 over a 2px border, so the row
          is 50px; two bars with their own margins came out 44px and dropped the
          grid by six pixels on arrival. */}
      <div className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-7xl px-6" aria-hidden>
          <span className="block border-b-2 border-transparent px-4 py-3.5">
            <Bar className="h-5 w-16" />
          </span>
          <span className="block border-b-2 border-transparent px-4 py-3.5">
            <Bar className="h-5 w-12" delay={160} />
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <MasonrySkeleton count={12} />
      </div>
    </>
  )
}

/** A film stock or camera page: breadcrumb, hero panel, then the grid. */
export function GearDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-16">
      {/* h-5: the breadcrumb is text-sm, which is a 20px line. */}
      <Bar className="mb-6 h-5 w-64 max-w-full" />
      <div className="mb-8 border border-neutral-800">
        <div className="flex flex-col md:flex-row">
          <Bar className="min-h-[200px] w-full md:w-2/5 lg:w-1/3" />
          <div className="flex-1 space-y-4 p-6 md:p-8">
            <Bar className="h-9 w-72 max-w-full" delay={160} />
            <Bar className="h-5 w-40" delay={320} />
            <div className="flex flex-wrap gap-2 pt-2">
              <Bar className="h-7 w-20" delay={160} />
              <Bar className="h-7 w-24" delay={320} />
              <Bar className="h-7 w-16" delay={480} />
            </div>
          </div>
        </div>
      </div>
      {/* The "Photos" heading and its count, which the grid sits under. */}
      <div className="mb-6 flex items-center justify-between">
        <Bar className="h-8 w-28" />
        <Bar className="h-5 w-16" delay={160} />
      </div>
      <MasonrySkeleton count={12} />
    </div>
  )
}
