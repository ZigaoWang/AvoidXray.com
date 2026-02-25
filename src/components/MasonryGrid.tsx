'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import QuickLikeButton from './QuickLikeButton'
import { blurHashToDataURL } from '@/lib/blurhash'

interface Photo {
  id: string
  thumbnailPath: string
  width: number
  height: number
  blurHash?: string | null
  liked?: boolean
  _count?: { likes: number }
}

interface MasonryGridProps {
  photos?: Photo[]
  // For infinite scroll mode
  initialPhotos?: Photo[]
  initialOffset?: number | null
  tab?: string
  emptyMessage?: string
  emptyLink?: { href: string; text: string }
}

export default function MasonryGrid({
  photos: staticPhotos,
  initialPhotos,
  initialOffset,
  tab,
  emptyMessage,
  emptyLink
}: MasonryGridProps) {
  const isInfiniteMode = initialPhotos !== undefined

  const [photos, setPhotos] = useState<Photo[]>(staticPhotos || initialPhotos || [])
  const [offset, setOffset] = useState<number | null>(initialOffset ?? null)
  const [loading, setLoading] = useState(false)
  const [columnCount, setColumnCount] = useState(4)
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth < 640) setColumnCount(2)
      else if (window.innerWidth < 1024) setColumnCount(3)
      else setColumnCount(4)
    }
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  // Update photos when static props change
  useEffect(() => {
    if (staticPhotos) {
      setPhotos(staticPhotos)
    }
  }, [staticPhotos])

  // Reset when tab changes (infinite mode)
  useEffect(() => {
    if (isInfiniteMode && initialPhotos) {
      setPhotos(initialPhotos)
      setOffset(initialOffset ?? null)
    }
  }, [isInfiniteMode, initialPhotos, initialOffset, tab])

  const loadMore = useCallback(async () => {
    if (!isInfiniteMode || loading || offset === null || !tab) return
    setLoading(true)

    const res = await fetch(`/api/photos?tab=${tab}&offset=${offset}&limit=20`)
    const data = await res.json()

    if (data.photos.length > 0) {
      const existingIds = new Set(photos.map(p => p.id))
      const newPhotos = data.photos.filter((p: Photo) => !existingIds.has(p.id))
      if (newPhotos.length > 0) {
        setPhotos(prev => [...prev, ...newPhotos])
      }
    }
    setOffset(data.nextOffset)
    setLoading(false)
  }, [isInfiniteMode, offset, loading, tab, photos])

  useEffect(() => {
    if (!isInfiniteMode) return

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
  }, [isInfiniteMode, offset, loading, loadMore])

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
      <div className="text-center py-24 border border-dashed border-neutral-800 rounded">
        <svg className="w-16 h-16 text-neutral-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-neutral-500 mb-4">{emptyMessage || 'No photos yet'}</p>
        {emptyLink && (
          <Link href={emptyLink.href} className="text-[#D32F2F] hover:underline">
            {emptyLink.text}
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
                    alt=""
                    width={400}
                    height={Math.round(400 * (photo.height / photo.width))}
                    className="w-full block"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    placeholder={photo.blurHash ? 'blur' : 'empty'}
                    blurDataURL={blurHashToDataURL(photo.blurHash)}
                  />
                  <QuickLikeButton
                    photoId={photo.id}
                    initialLiked={photo.liked || false}
                    initialCount={photo._count?.likes || 0}
                  />
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {isInfiniteMode && (
        <div ref={loaderRef} className="py-8 text-center">
          {loading && (
            <div className="inline-block w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          )}
          {offset === null && photos.length > 0 && (
            <p className="text-neutral-600 text-sm">You've seen all photos</p>
          )}
        </div>
      )}
    </>
  )
}
