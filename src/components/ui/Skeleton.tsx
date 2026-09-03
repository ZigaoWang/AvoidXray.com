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

/** One shimmering block. `animate-skeleton` is defined in globals.css. */
export function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-skeleton ${className}`} />
}

function HeaderShell() {
  return (
    <header className="sticky top-0 z-40 bg-[#0a0a0a]">
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
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
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

/** Page title and subtitle, as the real pages lay them out. */
export function TitleSkeleton() {
  return (
    <div className="mb-10">
      <Bar className="mb-3 h-9 w-56" />
      <Bar className="h-4 w-72" />
    </div>
  )
}

/**
 * A masonry of photographs, in the same four columns and the same gap the real
 * grid uses, so the swap when the photos arrive is a change of content rather
 * than a change of layout.
 */
export function MasonrySkeleton({ count = 12 }: { count?: number }) {
  // Fixed, repeating aspect ratios rather than random ones: a skeleton must
  // render identically on the server and the client.
  const ratios = ['aspect-[3/4]', 'aspect-[4/3]', 'aspect-square', 'aspect-[2/3]']
  const columns = 4

  return (
    <div className="flex gap-4">
      {Array.from({ length: columns }).map((_, col) => (
        <div
          key={col}
          className={`flex flex-1 flex-col gap-4 ${col === 1 ? 'hidden sm:flex' : ''} ${col >= 2 ? 'hidden lg:flex' : ''}`}
        >
          {Array.from({ length: Math.ceil(count / columns) }).map((_, row) => (
            <Bar key={row} className={ratios[(col + row) % ratios.length]} />
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
              <Bar key={j} className="aspect-square" />
            ))}
          </div>
          <div className="flex items-center gap-4 p-4">
            <Bar className="h-24 w-32 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <Bar className="mb-2 h-5 w-40" />
              <Bar className="h-4 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
