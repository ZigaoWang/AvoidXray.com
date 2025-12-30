import Image from 'next/image'
import Link from 'next/link'
import QuickLikeButton from './QuickLikeButton'

type Photo = {
  id: string
  thumbnailPath: string
  width: number
  height: number
  camera?: { name: string } | null
  filmStock?: { name: string } | null
  createdAt: Date
  _count?: { likes: number }
  liked?: boolean
}

export default function FilmStrip({ photos }: { photos: Photo[] }) {
  if (!photos.length) return null

  // Always render 5 slots, fill empty ones
  const slots = [...photos, ...Array(5 - photos.length).fill(null)].slice(0, 5)

  return (
    <div className="w-full group/strip">
      <div className="film-strip flex items-stretch w-full rounded-sm overflow-hidden">
        {/* Left sprocket column */}
        <div className="w-7 film-sprocket flex flex-col shrink-0">
          {slots.map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-evenly py-1">
              <div className="w-4 h-2.5 rounded-sm bg-[#1a1816]" />
              <div className="w-4 h-2.5 rounded-sm bg-[#1a1816]" />
            </div>
          ))}
        </div>

        {/* Photos */}
        <div className="flex flex-1 py-2 gap-0.5 bg-[#1a1816]">
          {slots.map((photo, i) => photo ? (
            <Link
              key={photo.id}
              href={`/photos/${photo.id}`}
              className="relative w-[20%] bg-[#0f0e0d] group"
              style={{ aspectRatio: '3/2' }}
            >
              <div className="absolute inset-1 overflow-hidden rounded-[1px]">
                <Image
                  src={photo.thumbnailPath}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="20vw"
                />
                {/* Like button */}
                <QuickLikeButton
                  photoId={photo.id}
                  initialLiked={photo.liked || false}
                  initialCount={photo._count?.likes || 0}
                />
              </div>
            </Link>
          ) : (
            <div
              key={`empty-${i}`}
              className="w-[20%] bg-[#0f0e0d] relative"
              style={{ aspectRatio: '3/2' }}
            >
              {/* Empty slot indicator */}
              <div className="absolute inset-1 border border-dashed border-[#2a2a2a] flex items-center justify-center">
                <span className="text-[#2a2a2a] text-xs">—</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right sprocket column */}
        <div className="w-7 film-sprocket flex flex-col shrink-0">
          {slots.map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-evenly py-1">
              <div className="w-4 h-2.5 rounded-sm bg-[#1a1816]" />
              <div className="w-4 h-2.5 rounded-sm bg-[#1a1816]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
