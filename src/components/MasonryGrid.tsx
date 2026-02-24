'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface Photo {
  id: string
  thumbnailPath: string
  width: number
  height: number
  user?: { name: string | null; username: string }
  camera?: { name: string; brand?: string | null } | null
  filmStock?: { name: string; brand?: string | null } | null
}

interface MasonryGridProps {
  photos: Photo[]
  showUser?: boolean
  showCamera?: boolean
  showFilm?: boolean
}

export default function MasonryGrid({ photos, showUser, showCamera, showFilm }: MasonryGridProps) {
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
    <div className="flex gap-2 md:gap-3">
      {columns.map((col, colIndex) => (
        <div key={colIndex} className="flex-1 flex flex-col gap-2 md:gap-3">
          {col.map(photo => (
            <Link
              key={photo.id}
              href={`/photos/${photo.id}`}
              className="group relative block bg-neutral-900 overflow-hidden"
            >
              <Image
                src={photo.thumbnailPath}
                alt=""
                width={400}
                height={Math.round(400 * (photo.height / photo.width))}
                className="w-full block group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                <div className="text-white">
                  {showUser && photo.user && (
                    <div className="text-sm font-medium">{photo.user.name || photo.user.username}</div>
                  )}
                  {showCamera && photo.camera && (
                    <div className="text-xs text-neutral-400">
                      {photo.camera.brand} {photo.camera.name}
                    </div>
                  )}
                  {showFilm && photo.filmStock && (
                    <div className="text-xs text-neutral-400">
                      {photo.filmStock.brand} {photo.filmStock.name}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}
