import Link from 'next/link'
import Image from 'next/image'
import { Fragment, type ReactNode } from 'react'
import { article, displayName, gearImageAlt, type NamedEntity } from '@/lib/seo/alt'
import GearIdentity from '@/components/GearIdentity'
import { canonicalCameraPath, canonicalFilmPath } from '@/lib/seo/slug'
import { cameraSpecs, type CameraSpecSource } from '@/lib/cameraFields'
import { filmSpecs, type FilmSpecSource } from '@/lib/filmFields'
import SpecChip from '@/components/SpecChip'
import { focusRing } from '@/components/ui/focus'
import { blurPlaceholder, BLUR_SIZE, CARD_PREVIEW_BLUR_COUNT } from '@/lib/blurhash'
import type { PreviewPhoto } from '@/lib/previewPhotos'

/**
 * The two cards a camera or a film stock is drawn as.
 *
 * `GearCard` is the narrow one: the gear as context beside something else, on a
 * photo page or a pairing page. `GearBrowseCard` is the wide one a browsing
 * grid is made of, with a strip of sample frames above the name.
 *
 * They share a file because every time they were apart they drifted. The wide
 * one was hand-written six times — once on /cameras, once on /films, twice in
 * the search results and twice in a profile's stats panel, where the copy was
 * introduced as the "exact style from /cameras & /films" and had since stopped
 * being it. The placeholder icon, the photo-count wording, the preview alt text
 * and the blur budget all disagreed by the time they were collected here.
 */

/** What either card needs to draw the product shot at the left of its row. */
type GearImage = NamedEntity & {
  imageUrl?: string | null
  imageStatus?: string | null
}

type Gear = GearImage & {
  id: string
  slug: string | null
}

/** Only an approved image is shown, the same rule every other surface applies. */
function approvedImage(gear: GearImage): string | null {
  return gear.imageStatus === 'approved' ? gear.imageUrl ?? null : null
}

const ICON = {
  camera: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
  ),
  film: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
  ),
}

/**
 * The record each kind needs, so a page that selects too few columns fails to
 * compile instead of quietly rendering a card with no chips on it.
 */
type GearCardProps =
  | { kind: 'camera'; gear: Gear & CameraSpecSource }
  | { kind: 'film'; gear: Gear & FilmSpecSource }

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
export default function GearCard(props: GearCardProps) {
  const { kind, gear } = props
  const specs = props.kind === 'camera' ? cameraSpecs(props.gear) : filmSpecs(props.gear)

  const image = approvedImage(gear)
  const href = kind === 'camera' ? canonicalCameraPath(gear) : canonicalFilmPath(gear)

  return (
    <Link
      href={href}
      className={`group block border border-neutral-800 bg-neutral-900 p-4
                  transition-colors hover:border-brand ${focusRing}`}
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

/**
 * How wide the preview strip is, which is what decides how many tiles a card
 * draws and how many blank ones fill the rest.
 *
 * `PREVIEW_PHOTOS` in lib/previewPhotos is the query-side counterpart and holds
 * the same number. It is not imported: that module reaches the database, and
 * this one is part of a profile's client bundle.
 */
const PREVIEW_TILES = 4

interface GearBrowseCardBase {
  kind: 'camera' | 'film'
  /** `iso` is read for a film and absent on a camera, which has no speed. */
  gear: GearImage & { iso?: number | null }
  /** Up to `PREVIEW_TILES` frames; the rest of the strip is left blank. */
  previews: PreviewPhoto[]
  photoCount: number
  /** The heading level the card sits at on the page using it. */
  as: 'h2' | 'h3'
  /** Position in its grid, which is what the blur budget is spent by. */
  cardIndex: number
  /**
   * One more fact for the row, after the photo count.
   *
   * The counts already differ per surface, so they are a prop; this is the one
   * place a surface adds to the sentence rather than filling it in. Search
   * names the manufacturer, because "who actually makes this" is a question a
   * search result is answering and a browse grid is not. The card owns the
   * separator and the color either way.
   */
  extraFact?: ReactNode
  /** The matched alias, where the card was reached by a name it does not print. */
  alsoKnownAs?: string | null
}

type GearBrowseCardProps =
  | (GearBrowseCardBase & { href: string })
  | (GearBrowseCardBase & { onSelect: () => void; selected: boolean })

/**
 * The same gear, as the wide card a grid of them is built from.
 *
 * Two jobs, because a profile's stats panel is not navigation: there the card
 * narrows the grid above it and says so with `aria-pressed`, and everywhere
 * else it is a link to the hub. That is the whole of the difference, so it is
 * the only thing the two shapes of prop disagree about, and a card asked for
 * with neither does not compile.
 */
export function GearBrowseCard(props: GearBrowseCardProps) {
  const { kind, gear, previews, photoCount, as, cardIndex, extraFact, alsoKnownAs } = props
  const image = approvedImage(gear)
  const name = displayName(gear) ?? gear.name
  const tiles = previews.slice(0, PREVIEW_TILES)

  // A body takes an article and a stock does not: "shot on an Olympus AF-1",
  // "shot on Kodak Gold 200". The article goes by how the name sounds, which is
  // what the copies got wrong — both hard-coded "a" and printed "a Olympus".
  const tileAlt = kind === 'camera'
    ? `Sample photo shot on ${article(name)} ${name}`
    : `Sample photo shot on ${name}`

  const facts: ReactNode[] = [
    // ISO leads a stock's line, as it does in its chips and on its own page.
    kind === 'film' && gear.iso ? `ISO ${gear.iso}` : null,
    `${photoCount} photo${photoCount === 1 ? '' : 's'}`,
    extraFact ?? null,
  ].filter(Boolean)

  const selected = 'href' in props ? false : props.selected
  const shell = `group block w-full overflow-hidden border bg-neutral-900 text-left
                 transition-colors ${focusRing} ${
    selected ? 'border-brand' : 'border-neutral-800 hover:border-brand'
  }`

  const body = (
    <>
      {/* Sample frames, then the product shot with the name beside it. */}
      <div className="grid grid-cols-4 gap-px bg-neutral-800">
        {tiles.map((photo, tileIndex) => (
          <div key={photo.id} className="relative aspect-square bg-neutral-900">
            <Image
              src={photo.thumbnailPath}
              alt={tileAlt}
              fill
              className="object-cover"
              sizes="100px"
              {...blurPlaceholder(
                photo.blurHash,
                cardIndex * PREVIEW_TILES + tileIndex,
                CARD_PREVIEW_BLUR_COUNT,
                BLUR_SIZE.tile
              )}
            />
          </div>
        ))}
        {/* Blank tiles for the rest of the row, so a stock nobody has shot much
            is the same height in the grid as one everybody has. */}
        {Array.from({ length: PREVIEW_TILES - tiles.length }).map((_, i) => (
          <div key={i} className="aspect-square bg-neutral-900" />
        ))}
      </div>

      <div className="flex items-center gap-4 p-4">
        {/* The box is drawn whether or not there is an image for it, so a
            catalog with half its product shots missing still lines up. */}
        <div className="relative h-24 w-32 shrink-0">
          {image ? (
            <Image src={image} alt={gearImageAlt(gear, kind)} fill className="object-contain" sizes="128px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-800">
              <svg className="h-12 w-12 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                {ICON[kind]}
              </svg>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <GearIdentity as={as} gear={gear} />

          <div className="flex items-center gap-2 text-neutral-500">
            {facts.map((fact, i) => (
              <Fragment key={i}>
                {i > 0 && <span>•</span>}
                <span>{fact}</span>
              </Fragment>
            ))}
          </div>

          {alsoKnownAs && (
            <p className="mt-1 truncate text-xs text-neutral-600">
              Also known as <span className="text-neutral-400">{alsoKnownAs}</span>
            </p>
          )}
        </div>
      </div>
    </>
  )

  return 'href' in props ? (
    <Link href={props.href} className={shell}>{body}</Link>
  ) : (
    <button
      type="button"
      onClick={props.onSelect}
      // The card filters the grid, and the only sign it was doing so was a red
      // border. aria-pressed is what says "this filter is on".
      aria-pressed={props.selected}
      className={shell}
    >
      {body}
    </button>
  )
}
