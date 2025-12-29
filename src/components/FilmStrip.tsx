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

  const formatDate = (date: Date) => {
    const d = new Date(date)
    return `'${String(d.getFullYear()).slice(-2)} ${d.getMonth() + 1} ${d.getDate()}`
  }

  // Always render 5 slots, fill empty ones
  const slots = [...photos, ...Array(5 - photos.length).fill(null)].slice(0, 5)

  return (
    <div className="w-full">
      <div className="bg-[#2d2926] flex items-stretch w-full shadow-xl">
        {/* Left sprocket column */}
        <div className="w-7 bg-[#1f1c1a] flex flex-col shrink-0">
          {slots.map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-evenly py-1">
              <div className="w-4 h-2.5 rounded-sm bg-[#2d2926]" />
              <div className="w-4 h-2.5 rounded-sm bg-[#2d2926]" />
            </div>
          ))}
        </div>

        {/* Photos */}
        <div className="flex flex-1 py-2 gap-0.5">
          {slots.map((photo, i) => photo ? (
            <Link
              key={photo.id}
              href={`/photos/${photo.id}`}
              className="relative w-[20%] bg-[#1f1c1a] group"
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
                {/* Data back style overlay */}
                <div className="absolute bottom-0 right-0 left-0 p-1.5 flex justify-between items-end pointer-events-none">
                  <div className="text-[8px] text-orange-400/80 font-mono tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                    {photo.filmStock?.name || photo.camera?.name || ''}
                  </div>
                  <div className="text-[8px] text-orange-400/80 font-mono tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                    {formatDate(photo.createdAt)}
                  </div>
                </div>
                {/* Like button */}
                <QuickLikeButton
                  photoId={photo.id}
                  initialLiked={photo.liked || false}
                  initialCount={photo._count?.likes || 0}
                />
              </div>
            </Link>
          ) : (
            <div key={`empty-${i}`} className="w-[20%] bg-[#1f1c1a]" style={{ aspectRatio: '3/2' }} />
          ))}
        </div>

        {/* Right sprocket column */}
        <div className="w-7 bg-[#1f1c1a] flex flex-col shrink-0">
          {slots.map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-evenly py-1">
              <div className="w-4 h-2.5 rounded-sm bg-[#2d2926]" />
              <div className="w-4 h-2.5 rounded-sm bg-[#2d2926]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
