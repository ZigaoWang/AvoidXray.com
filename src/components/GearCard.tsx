import Link from 'next/link'
import Image from 'next/image'
import { gearImageAlt, type NamedEntity } from '@/lib/seo/alt'
import GearIdentity from '@/components/GearIdentity'
import { canonicalCameraPath, canonicalFilmPath } from '@/lib/seo/slug'
import { cameraSpecs, type CameraSpecSource } from '@/lib/cameraFields'
import { filmSpecs, type FilmSpecSource } from '@/lib/filmFields'
import SpecChip from '@/components/SpecChip'

/**
 * A film stock or a camera, as a card that links to its page.
 *
 * The photo page drew this twice, inline and once per kind, differing only in
 * the icon and the label. The combination page then grew a third copy with its
 * own panel, its own image size and its own hover color, which is exactly the
 * second card component four pixels off the first that makes a site feel
 * unfinished.
 *
 * One card, both kinds, everywhere the pair is shown.
 *
 * The chips are derived here rather than passed in. They used to be a `specs`
 * prop, and every page filled it differently: the pairing page gave four facts
 * per side, the photo page gave a film its ISO and a camera nothing at all, so
 * the two cards under a photograph did not match each other. A shared component
 * whose contents are decided by its callers is not shared in the way that
 * matters. Taking the prop away is what makes them agree, so it is gone rather
 * than defaulted.
 */

type Gear = NamedEntity & {
  id: string
  slug: string | null
  imageUrl?: string | null
  imageStatus?: string | null
}

/**
 * The record each kind needs, so a page that selects too few columns fails to
 * compile instead of quietly rendering a card with no chips on it.
 */
type GearCardProps =
  | { kind: 'camera'; gear: Gear & CameraSpecSource }
  | { kind: 'film'; gear: Gear & FilmSpecSource }

const ICON = {
  camera: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
  ),
  film: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
  ),
}

export default function GearCard(props: GearCardProps) {
  const { kind, gear } = props
  const specs = props.kind === 'camera' ? cameraSpecs(props.gear) : filmSpecs(props.gear)

  // Only an approved image is shown, the same rule every other surface applies.
  const image = gear.imageStatus === 'approved' ? gear.imageUrl : null
  const href = kind === 'camera' ? canonicalCameraPath(gear) : canonicalFilmPath(gear)

  return (
    <Link
      href={href}
      className="group block border border-neutral-800 bg-neutral-900 p-4
                 transition-colors hover:border-brand
                 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
                 focus-visible:outline-brand"
    >
      {/* Picture, then a column holding the name with its chips under it.
          The chips belong to the name, so they sit in its column and start
          where it starts. Two earlier arrangements were worse: a full-bleed
          row underneath began at the card's left edge under the picture, so
          nothing lined up and the card read as two unrelated blocks; indenting
          that row to match the name fixed the alignment but left the gap the
          picture's height creates between them, which is dead space with
          chips floating in it.
          The cost is that in a half-width card the column is narrow enough
          that four chips wrap, which is what the previous note here objected
          to. A wrap inside the column is the honest behavior, and the row is
          centered against the picture either way, so it costs no height until
          it actually wraps. */}
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-20 shrink-0 items-center justify-center">
          {image ? (
            <Image src={image} alt={gearImageAlt(gear, kind)} fill className="object-contain" sizes="80px" />
          ) : (
            <svg className="h-8 w-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              {ICON[kind]}
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <GearIdentity gear={gear} variant="compact" />

          {/* gap-2, matching the detail pages. This row was gap-1.5, which is
              the drift that comes of three copies of the same idea. */}
          {specs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {specs.map(s => (
                <SpecChip key={s}>{s}</SpecChip>
              ))}
            </div>
          )}
        </div>

        <svg
          className="h-5 w-5 shrink-0 text-neutral-600 transition-colors group-hover:text-brand"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}
