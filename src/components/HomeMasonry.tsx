'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import QuickLikeButton from './QuickLikeButton'

interface PhotoItem {
  type: 'photo'
  id: string
  thumbnailPath: string
  width: number
  height: number
  liked: boolean
  _count: { likes: number }
}

interface FilmItem {
  type: 'film'
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
  _count: { photos: number }
}

interface CameraItem {
  type: 'camera'
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
  _count: { photos: number }
}

type MasonryItem = PhotoItem | FilmItem | CameraItem

interface HomeMasonryProps {
  items: MasonryItem[]
}

export default function HomeMasonry({ items }: HomeMasonryProps) {
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
    const cols: MasonryItem[][] = Array.from({ length: columnCount }, () => [])
    const heights = Array(columnCount).fill(0)

    items.forEach(item => {
      const shortestCol = heights.indexOf(Math.min(...heights))
      cols[shortestCol].push(item)

      // Estimate height ratio
      if (item.type === 'photo') {
        heights[shortestCol] += item.height / item.width
      } else {
        // Film/camera cards have fixed aspect ratio
        heights[shortestCol] += 1.2
      }
    })

    return cols
  }, [items, columnCount])

  if (items.length === 0) return null

  return (
    <div className="flex gap-4">
      {columns.map((col, colIndex) => (
        <div key={colIndex} className="flex-1 flex flex-col gap-4">
          {col.map(item => {
            if (item.type === 'photo') {
              return (
                <Link key={item.id} href={`/photos/${item.id}`} className="group relative block">
                  <div className="relative bg-neutral-900 overflow-hidden">
                    <Image
                      src={item.thumbnailPath}
                      alt=""
                      width={400}
                      height={Math.round(400 * (item.height / item.width))}
                      className="w-full block"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                    <QuickLikeButton
                      photoId={item.id}
                      initialLiked={item.liked}
                      initialCount={item._count.likes}
                    />
                  </div>
                </Link>
              )
            } else if (item.type === 'film') {
              return (
                <Link
                  key={`film-${item.id}`}
                  href={`/films/${item.id}`}
                  className="group block bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden"
                >
                  <div className="aspect-square bg-neutral-800 flex items-center justify-center p-6">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={200}
                        height={200}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <svg className="w-16 h-16 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-[#D32F2F] uppercase tracking-wider mb-1">Film</div>
                    <h3 className="text-white font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                      {item.brand ? `${item.brand} ${item.name}` : item.name}
                    </h3>
                    <p className="text-neutral-500 text-sm">{item._count.photos} photos</p>
                  </div>
                </Link>
              )
            } else {
              return (
                <Link
                  key={`camera-${item.id}`}
                  href={`/cameras/${item.id}`}
                  className="group block bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden"
                >
                  <div className="aspect-square bg-neutral-800 flex items-center justify-center p-6">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={200}
                        height={200}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <svg className="w-16 h-16 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-[#D32F2F] uppercase tracking-wider mb-1">Camera</div>
                    <h3 className="text-white font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                      {item.brand ? `${item.brand} ${item.name}` : item.name}
                    </h3>
                    <p className="text-neutral-500 text-sm">{item._count.photos} photos</p>
                  </div>
                </Link>
              )
            }
          })}
        </div>
      ))}
    </div>
  )
}
