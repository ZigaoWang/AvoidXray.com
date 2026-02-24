'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import QuickLikeButton from './QuickLikeButton'

interface Photo {
  id: string
  thumbnailPath: string
  width: number
  height: number
  liked?: boolean
  _count?: { likes: number }
}

interface MasonryGridProps {
  photos: Photo[]
}

export default function MasonryGrid({ photos }: MasonryGridProps) {
  const [columnCount, setColumnCount] = useState(4)

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
        <p className="text-neutral-500">No photos yet</p>
      </div>
    )
  }

  return (
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
  )
}
