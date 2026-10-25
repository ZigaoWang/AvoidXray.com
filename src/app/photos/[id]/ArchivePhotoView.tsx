import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Prisma } from '@prisma/client'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Lightbox from '@/components/Lightbox'
import GearCard from '@/components/GearCard'
import { ButtonLink } from '@/components/ui/Button'
import { eyebrowClass } from '@/components/ui/PageHeader'
import { blurHashToDataURL } from '@/lib/blurhash'

/** What the page loads for a photo, archive record included. */
export const ARCHIVE_PHOTO_INCLUDE = {
  archiveRecord: { include: { source: true } },
} as const satisfies Prisma.PhotoInclude

type ArchivePhoto = Prisma.PhotoGetPayload<{
  include: { camera: true; filmStock: true } & typeof ARCHIVE_PHOTO_INCLUDE
}>

/** How a film tag on an archive photo was arrived at, for the reader. */
const FILM_TAG_SOURCE: Record<string, string | null> = {
  STATED_BY_ARCHIVE: 'Stated in the archive record',
  INFERRED: 'Inferred; the archive record does not name the film',
  UNKNOWN: null,
}

/** The title for an archive photo: the archive's own, or a plain fallback. */
export function archiveTitle(photo: { archiveRecord: { originalTitle: string | null } | null }): string {
  return photo.archiveRecord?.originalTitle || 'Archive photograph'
}

/**
 * The page for a photograph imported from a public archive.
 *
 * Built from the same pieces as a community photo's page, with the parts that
 * belong to an uploader left out: no byline, likes, comments, albums, export
 * or prev/next through a feed. In their place is the archive's record, copied
 * as published, including its notes, which is where it records doubts about
 * who took a picture. The full-resolution original stays with the archive and
 * is linked rather than served from here.
 */
export default function ArchivePhotoView({ photo, isAdmin }: { photo: ArchivePhoto; isAdmin: boolean }) {
  const record = photo.archiveRecord
  const title = archiveTitle(photo)
  const filmTagSource = record && photo.filmStock ? FILM_TAG_SOURCE[record.filmTagSource] : null

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-6 md:py-8">
          <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
            <div className="lg:flex-1">
              <div className="border border-neutral-800">
                <div
                  className="relative bg-neutral-950 mx-auto w-full"
                  style={{
                    aspectRatio: `${photo.width} / ${photo.height}`,
                    maxWidth: `calc(80vh * ${photo.width} / ${photo.height})`,
                  }}
                >
                  <Image
                    src={photo.mediumPath}
                    alt={title}
                    fill
                    className="object-contain"
                    priority
                    placeholder={photo.blurHash ? 'blur' : 'empty'}
                    blurDataURL={blurHashToDataURL(photo.blurHash)}
                    sizes="(max-width: 1024px) 100vw, 880px"
                  />
                  <Lightbox
                    photoId={photo.id}
                    src={photo.originalPath}
                    mediumSrc={photo.mediumPath}
                    alt={title}
                    width={photo.width}
                    height={photo.height}
                    blurHash={photo.blurHash}
                  />
                </div>
              </div>
              {photo.filmStock && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GearCard kind="film" gear={photo.filmStock} />
                </div>
              )}
            </div>

            <div className="lg:w-80 min-w-0 flex flex-col gap-6">
              <div className="bg-neutral-900 border border-neutral-800 p-4">
                <div className={`${eyebrowClass} mb-2`}>Archive photograph</div>
                <h1 className="text-white font-semibold leading-snug">{title}</h1>
                {record?.photographer && (
                  <p className="mt-3 text-sm text-neutral-300">{record.photographer}</p>
                )}
                {record?.notes && (
                  <div className="mt-4 border-t border-neutral-800 pt-3">
                    <div className="text-neutral-500 text-sm mb-1">Notes from the archive</div>
                    <p className="text-sm text-neutral-300 whitespace-pre-line [overflow-wrap:anywhere]">{record.notes}</p>
                  </div>
                )}
              </div>

              <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                <div className={`${eyebrowClass} mb-3`}>Details</div>
                {record?.takenAt && <Row label="Date">{record.takenAt}</Row>}
                {record?.medium && <Row label="Medium">{record.medium}</Row>}
                {filmTagSource && <Row label="Film tag">{filmTagSource}</Row>}
              </div>

              {record && (
                <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                  <div className={`${eyebrowClass} mb-3`}>Source</div>
                  <p className="text-sm text-neutral-300">
                    <a
                      href={record.source.homepageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white underline decoration-neutral-600 underline-offset-2 hover:decoration-white"
                    >
                      {record.source.name}
                    </a>
                  </p>
                  <Row label="Credit">{record.source.creditLine}</Row>
                  <Row label="License">{record.source.license}</Row>
                  {record.rightsNote && <Row label="Rights">{record.rightsNote}</Row>}
                  <div className="grid grid-cols-1 gap-3 border-t border-neutral-800 pt-3">
                    <ButtonLink href={record.sourceUrl} variant="outline" size="md" fullWidth target="_blank" rel="noopener noreferrer">
                      Archive record
                      <span className="sr-only"> (opens in a new tab)</span>
                    </ButtonLink>
                    {record.sourceHandleUrl && (
                      <ButtonLink href={record.sourceHandleUrl} variant="outline" size="md" fullWidth target="_blank" rel="noopener noreferrer">
                        Full-resolution original
                        <span className="sr-only"> (opens in a new tab)</span>
                      </ButtonLink>
                    )}
                  </div>
                  {isAdmin && (
                    <Link href={`/admin/photos?q=${photo.id}`} className="block text-neutral-500 hover:text-white text-sm transition-colors font-medium">
                      Admin
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-neutral-500 text-sm flex-shrink-0">{label}</span>
      <span className="text-white text-sm text-right [overflow-wrap:anywhere] min-w-0">{children}</span>
    </div>
  )
}
