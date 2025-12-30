'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  initialOffset: number | null
  tab: string
}

export default function PhotoGrid({ initialPhotos, initialOffset, tab }: PhotoGridProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [offset, setOffset] = useState<number | null>(initialOffset)
  const [loading, setLoading] = useState(false)
  const [columnCount, setColumnCount] = useState(4)
  const loaderRef = useRef<HTMLDivElement>(null)
  const columnHeights = useRef<number[]>([])

  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth < 768) setColumnCount(2)
      else if (window.innerWidth < 1024) setColumnCount(3)
      else setColumnCount(4)
    }
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  const loadMore = useCallback(async () => {
    if (loading || offset === null) return
    setLoading(true)

    const res = await fetch(`/api/photos?tab=${tab}&offset=${offset}&limit=20`)
    const data = await res.json()

    if (data.photos.length > 0) {
      setPhotos(prev => [...prev, ...data.photos])
    }
    setOffset(data.nextOffset)
    setLoading(false)
  }, [offset, loading, tab])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && offset !== null && !loading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [offset, loading, loadMore])

  useEffect(() => {
    setPhotos(initialPhotos)
    setOffset(initialOffset)
    columnHeights.current = []
  }, [initialPhotos, initialOffset, tab])

  // Distribute photos into columns based on height
  const columns = useMemo(() => {
    const cols: Photo[][] = Array.from({ length: columnCount }, () => [])
    const heights = Array(columnCount).fill(0)

    photos.forEach(photo => {
      const shortestCol = heights.indexOf(Math.min(...heights))
      cols[shortestCol].push(photo)
      heights[shortestCol] += photo.height / photo.width
    })

    return cols
  }, [photos, columnCount])

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
      <div className="flex gap-4">
        {columns.map((col, colIndex) => (
          <div key={colIndex} className="flex-1 flex flex-col gap-4">
            {col.map(photo => (
              <Link key={photo.id} href={`/photos/${photo.id}`} className="group relative block">
                <div className="relative bg-neutral-900 overflow-hidden">
                  <Image
                    src={photo.thumbnailPath}
                    alt={photo.caption || ''}
                    width={400}
                    height={Math.round(400 * (photo.height / photo.width))}
                    className="w-full block"
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
        ))}
      </div>

      <div ref={loaderRef} className="py-8 text-center">
        {loading && (
          <div className="inline-block w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        )}
        {offset === null && photos.length > 0 && (
          <p className="text-neutral-600 text-sm">You've seen all photos</p>
        )}
      </div>
    </>
  )
}
