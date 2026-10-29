import Image from 'next/image'
import Link from 'next/link'
import { photoAlt } from '@/lib/seo/alt'
import { blurHashToDataURL } from '@/lib/blurhash'
import type { RelatedPhoto } from '@/lib/relatedPhotos'

/** A row of photo tiles with the photographer's name under each. */
export default function PhotoStrip({ photos, showNames = true }: { photos: RelatedPhoto[]; showNames?: boolean }) {
  return (
    <ul className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {photos.map(p => (
        <li key={p.id}>
          <Link href={`/photos/${p.id}`} className="group block">
            <span className="relative block aspect-[3/2] bg-neutral-900 overflow-hidden">
              <Image unoptimized
                src={p.thumbnailPath}
                alt={photoAlt(p)}
                fill
                // Still on hover, as on every other photo wall
                // here. This tile zoomed, the one place on the site
                // that did, and the photograph is not the thing to
                // animate; the name under it brightens instead.
                className="object-cover"
                sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 300px"
                placeholder={p.blurHash ? 'blur' : 'empty'}
                blurDataURL={blurHashToDataURL(p.blurHash)}
              />
            </span>
            {/* Under the frame rather than over it on hover: a
                touchscreen has no hover, and a name that only
                appears for a mouse is a name half the visitors
                never see. */}
            {showNames && (
              <span className="mt-2 block truncate text-xs text-neutral-500 group-hover:text-neutral-300 transition-colors">
                {p.user.name || `@${p.user.username}`}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
