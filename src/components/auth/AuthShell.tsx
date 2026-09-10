import Link from 'next/link'
import Image from 'next/image'
import { blurHashToDataURL } from '@/lib/blurhash'
import type { AuthShowcase } from '@/lib/authShowcase'
import { focusRing } from '@/components/ui/focus'

/**
 * The frame around every sign-in, join and password form.
 *
 * The photographs are the argument; everything else is in the way of it. This
 * screen had accumulated three separate pitches — a subtitle under the
 * heading, a sentence laid over the collage, and a row of counted totals — and
 * three separate places to navigate from: a back link and the wordmark at the
 * top, and a strip of section links under the form. For a page whose whole job
 * is four boxes and a button, that is more furniture than form.
 *
 * What is left: the wordmark, the heading, one line saying what the page is
 * for, the form, and the photographs. No copy over the collage and no
 * gradient across it — the photographs are the argument, so nothing is
 * painted on top of them.
 *
 * The form comes first in the DOM. The collage is decorative and marked as
 * such, so a screen reader lands on the heading rather than walking a dozen
 * unlabeled images to reach it.
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
  const { photos } = showcase
  const hasPhotos = photos.length > 0

  return (
    <div className="relative min-h-dvh bg-[#0a0a0a] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      {/* The form side. On a phone it follows the band of photographs and is as
          tall as it needs to be; from lg it is a column that scrolls beside a
          pinned showcase. */}
      <div className="relative flex min-h-dvh flex-col px-6 pb-12 pt-8 sm:px-10 lg:px-14 lg:py-10">
        {/*
          Below lg the wordmark, the photographs and the form share one measure
          and sit centerd in the viewport.

          There is a wide band — a tablet, or a small laptop window — that is
          too narrow for two columns and far too wide for a 384px form pinned
          to the left edge. It left two thirds of the screen empty beside the
          fields, with a photo strip stretched across the full width above
          them, none of it lining up with anything.
        */}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col lg:mx-0 lg:max-w-none">
          {/* The wordmark, on the left, where it is on every other page. It is
              also the way out: a second labeled back link beside it was one
              more thing to read on a screen that asks for an email address. */}
          <header>
            <Link href="/" className={`inline-block ${focusRing}`} aria-label="AvoidXray home">
              <Image src="/logo.svg" alt="AvoidXray" width={112} height={22} priority />
            </Link>
          </header>

          {/*
            The photographs, below lg: a short window onto the same packed
            collage, fading out at the bottom.

            The height is fixed and the columns are fed twelve frames, which
            overflows it even on a 375px screen holding nothing but panoramas —
            checked, because an under-filled band is the notch again. Letting the packing decide
            the height instead left the three columns ending at three different
            heights, which on six photographs is not a contact sheet, it is a
            black notch in the corner.

            The fade is what makes the cut deliberate. A hard edge across the
            middle of a photograph reads as a bug; a fade into the page reads
            as more of them below.

            Aligned to the form's own measure, so its edges line up with the
            fields under it.
          */}
          {hasPhotos && (
            <div className="relative mt-8 h-44 overflow-hidden sm:h-52 lg:hidden" aria-hidden>
              <Collage photos={photos.slice(0, 12)} columns={3} sizes="34vw" fill />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />
            </div>
          )}

          <main id="main-content" tabIndex={-1} className="flex flex-1 items-center pt-8 pb-12 outline-none lg:py-12">
            <div className="w-full lg:max-w-sm">
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
              <p className="mt-3 mb-8 text-neutral-400">{subtitle}</p>
              {children}
              {footer && <div className="mt-6 text-sm text-neutral-500">{footer}</div>}
            </div>
          </main>
        </div>
      </div>

      {/*
        The showcase, from lg.

        Pinned to the viewport and exactly as tall as it, so the collage
        overflows the bottom and is cut by the edge of the screen rather than
        running out partway down a long form. Sign-up is the tallest of these
        forms, and beside it the photographs used to stop with black underneath.
      */}
      {hasPhotos && (
        <div
          className="relative hidden border-l border-neutral-800 lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-hidden"
          aria-hidden
        >
          <Collage photos={photos} columns={3} sizes="18vw" fill />
        </div>
      )}
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
  fill = false,
}: {
  photos: AuthShowcase['photos']
  columns: number
  sizes: string
  /**
   * Pin to the parent and let the columns overflow its bottom edge, for the
   * full-height panel. Off, the collage sits in normal flow and is as tall as
   * the packing comes to, so nothing is cropped.
   */
  fill?: boolean
}) {
  const cols: AuthShowcase['photos'][] = Array.from({ length: columns }, () => [])
  const heights = new Array(columns).fill(0)

  for (const photo of photos) {
    const shortest = heights.indexOf(Math.min(...heights))
    cols[shortest].push(photo)
    heights[shortest] += photo.height / photo.width
  }

  return (
    // No padding: this is a full-bleed panel, and an inset left a thin black
    // margin down the edge the photographs are supposed to run off.
    <div className={`flex gap-2 ${fill ? 'absolute inset-0' : ''}`}>
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
