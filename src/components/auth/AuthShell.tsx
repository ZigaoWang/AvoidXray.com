import Link from 'next/link'
import Image from 'next/image'
import { blurHashToDataURL } from '@/lib/blurhash'
import type { AuthShowcase } from '@/lib/authShowcase'

/**
 * The frame around every sign-in, join and password form.
 *
 * All four of these pages were a logo in the corner and a form in the middle
 * of an empty black page — no header, no footer, no way anywhere else, and
 * nothing showing what the site actually contains. That is the first thing a
 * new visitor sees, and it said nothing.
 *
 * The photographs are the argument. On a wide screen they take the right half
 * at full brightness beside the form; on a phone they are a band across the
 * top, with the form below on plain background — a form laid over photographs
 * is a form nobody can read, and a phone has no room to put the two side by
 * side.
 *
 * The form comes first in the DOM. The collage is decorative and marked as
 * such, so a screen reader lands on the heading rather than walking a dozen
 * unlabelled images to reach it.
 */
export default function AuthShell({
  title,
  subtitle,
  showcase,
  children,
  footer,
}: {
  title: string
  subtitle: string
  showcase: AuthShowcase
  children: React.ReactNode
  /** The line under the form — "No account? Create one". */
  footer?: React.ReactNode
}) {
  const { photos, totalPhotos, totalFilms, totalCameras } = showcase
  const hasPhotos = photos.length > 0

  return (
    <div className="relative min-h-dvh bg-[#0a0a0a] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* The form side. Full height only from lg, where it is a column beside
          the showcase; on a phone it follows the band and is as tall as it
          needs to be. */}
      <div className="relative flex flex-col px-6 pb-10 pt-8 sm:px-10 lg:min-h-dvh lg:px-14 lg:py-8">
        {/*
          A way out, spelled out.

          The logo was the only route off these pages, and a logo is not a
          control anybody is taught to press — someone who tapped Join from a
          photo and changed their mind had the browser's back button and
          nothing else, which is not there at all if they arrived from a link.

          So: a labelled back link, with an arrow, at the top left where a back
          control belongs, and the wordmark beside it still pointing home.
        */}
        <header className="flex items-center gap-4">
          <Link
            href="/explore"
            className="-ml-2 inline-flex h-11 items-center gap-1.5 px-2 text-sm text-neutral-400
                       transition-colors hover:text-white focus-visible:outline focus-visible:outline-1
                       focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]"
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Browse photos
          </Link>

          <Link
            href="/"
            className="ml-auto inline-block focus-visible:outline focus-visible:outline-1
                       focus-visible:outline-offset-4 focus-visible:outline-[#D32F2F]"
            aria-label="AvoidXray home"
          >
            <Image src="/logo.svg" alt="AvoidXray" width={132} height={26} priority />
          </Link>
        </header>

        {/*
          The photographs, on a phone.

          Below the header rather than above it: this sat at the very top, so
          the only way back was under a third of a screen of imagery and you
          had to scroll past the picture to find the navigation. Negative
          margins take it full width again inside a padded column.

          Six rather than the twelve the wide layout shows — a band this size
          does not need more, and a phone should not fetch images it will not
          draw.
        */}
        {hasPhotos && (
          <div
            className="relative -mx-6 mt-6 h-[26dvh] min-h-[150px] overflow-hidden sm:-mx-10 lg:hidden"
            aria-hidden
          >
            <Collage photos={photos.slice(0, 6)} columns={3} sizes="34vw" />
            <div className="absolute inset-0 bg-[#0a0a0a]/25" />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
          </div>
        )}

        <main className="flex flex-1 items-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-2 mb-8 text-neutral-400">{subtitle}</p>
            {children}
            {footer && <div className="mt-6 text-sm text-neutral-500">{footer}</div>}
          </div>
        </main>

        {/* Somewhere to go that is not the form. These pages were a dead end:
            the only link on them was the logo. */}
        <footer className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-neutral-600">
          <Link href="/films" className="transition-colors hover:text-neutral-300">
            Film stocks
          </Link>
          <Link href="/cameras" className="transition-colors hover:text-neutral-300">
            Cameras
          </Link>
          <Link href="/legal" className="transition-colors hover:text-neutral-300">
            Terms &amp; privacy
          </Link>
        </footer>
      </div>

      {/* The showcase, on wide screens only. */}
      {hasPhotos && (
        <div className="relative hidden overflow-hidden lg:block" aria-hidden>
          <Collage photos={photos} columns={3} sizes="18vw" />

          {/* Fades the collage into the form side so the two halves meet on a
              gradient rather than a hard seam, and darkens the foot of the
              panel so the figures below stay readable over any photograph. */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-[#0a0a0a] to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-10">
            <p className="mb-4 max-w-sm text-lg font-medium text-white">
              Every frame here was shot on film and scanned by the person who took it.
            </p>
            <dl className="flex items-center gap-8">
              <Stat value={totalPhotos} label="Photos" />
              <Stat value={totalFilms} label="Film stocks" />
              <Stat value={totalCameras} label="Cameras" />
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-2xl font-black tabular-nums text-white">
          {value.toLocaleString('en-US')}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      </dd>
    </div>
  )
}

/**
 * The photographs, packed shortest-column-first so the columns end level.
 *
 * Each tile keeps its own aspect ratio, so the collage reads as a contact
 * sheet rather than a grid of crops — and nothing shifts as the images arrive,
 * because the boxes are sized before they load.
 */
function Collage({
  photos,
  columns,
  sizes,
}: {
  photos: AuthShowcase['photos']
  columns: number
  sizes: string
}) {
  const cols: AuthShowcase['photos'][] = Array.from({ length: columns }, () => [])
  const heights = new Array(columns).fill(0)

  for (const photo of photos) {
    const shortest = heights.indexOf(Math.min(...heights))
    cols[shortest].push(photo)
    heights[shortest] += photo.height / photo.width
  }

  return (
    <div className="absolute inset-0 flex gap-2 p-2">
      {cols.map((col, i) => (
        <div key={i} className="flex flex-1 flex-col gap-2">
          {col.map(photo => (
            <div
              key={photo.id}
              className="relative w-full flex-shrink-0 overflow-hidden bg-neutral-900"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
            >
              <Image
                src={photo.thumbnailPath}
                alt=""
                fill
                sizes={sizes}
                className="object-cover"
                placeholder={photo.blurHash ? 'blur' : 'empty'}
                blurDataURL={blurHashToDataURL(photo.blurHash)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
