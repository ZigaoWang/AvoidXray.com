'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import QuickLikeButton from './QuickLikeButton'

interface Photo {
  id: string
  thumbnailPath: string
  caption: string | null
  width: number
  height: number
  user: { username: string }
  filmStock: { name: string } | null
  camera: { name: string } | null
  _count: { likes: number }
  liked?: boolean
}

interface PhotoGridProps {
  initialPhotos: Photo[]
  initialCursor: string | null
  tab: string
}

export default function PhotoGrid({ initialPhotos, initialCursor, tab }: PhotoGridProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [loading, setLoading] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)

    const res = await fetch(`/api/photos?tab=${tab}&cursor=${cursor}&limit=20`)
    const data = await res.json()

    setPhotos(prev => [...prev, ...data.photos])
    setCursor(data.nextCursor)
    setLoading(false)
  }, [cursor, loading, tab])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && cursor && !loading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [cursor, loading, loadMore])

  useEffect(() => {
    setPhotos(initialPhotos)
    setCursor(initialCursor)
  }, [initialPhotos, initialCursor, tab])

  if (photos.length === 0) {
    return (
      <div className="text-center py-20 border border-dashed border-neutral-800">
        <p className="text-neutral-500 mb-4">
          {tab === 'following' ? "No photos from people you follow yet" : "No photos yet"}
        </p>
        {tab === 'following' && (
          <Link href="/explore?tab=trending" className="text-[#D32F2F] hover:underline">
            Discover photographers to follow
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
        {photos.map(photo => (
          <Link key={photo.id} href={`/photos/${photo.id}`} className="block break-inside-avoid group relative">
            <div className="relative bg-neutral-900 overflow-hidden">
              <Image
                src={photo.thumbnailPath}
                alt={photo.caption || ''}
                width={400}
                height={Math.round(400 * (photo.height / photo.width))}
                className="w-full"
                loading="lazy"
              />
              <QuickLikeButton
                photoId={photo.id}
                initialLiked={photo.liked || false}
                initialCount={photo._count.likes}
              />
            </div>
          </Link>
        ))}
      </div>

      <div ref={loaderRef} className="py-8 text-center">
        {loading && (
          <div className="inline-block w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        )}
        {!cursor && photos.length > 0 && (
          <p className="text-neutral-600 text-sm">You've seen all photos</p>
        )}
      </div>
    </>
  )
}
