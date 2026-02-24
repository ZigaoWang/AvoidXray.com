'use client'

import { useMemo } from 'react'
import Image from 'next/image'

interface PhotoItem {
  type: 'photo'
  id: string
  thumbnailPath: string
  width: number
  height: number
}

interface FilmItem {
  type: 'film'
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
}

interface CameraItem {
  type: 'camera'
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
}

type MasonryItem = PhotoItem | FilmItem | CameraItem

interface HeroMasonryProps {
  items: MasonryItem[]
}

export default function HeroMasonry({ items }: HeroMasonryProps) {
  const columnCount = 6 // Fixed for hero background - more columns = smaller items = more impressive

  const columns = useMemo(() => {
    const cols: MasonryItem[][] = Array.from({ length: columnCount }, () => [])
    const heights = Array(columnCount).fill(0)

    items.forEach(item => {
      const shortestCol = heights.indexOf(Math.min(...heights))
      cols[shortestCol].push(item)

      if (item.type === 'photo') {
        heights[shortestCol] += item.height / item.width
      } else {
        heights[shortestCol] += 1.3 // Film/camera cards
      }
    })

    return cols
  }, [items])

  if (items.length === 0) return null

  return (
    <div className="flex gap-2 h-full">
      {columns.map((col, colIndex) => (
        <div key={colIndex} className="flex-1 flex flex-col gap-2">
          {col.map((item, itemIndex) => {
            if (item.type === 'photo') {
              return (
                <div key={`${item.id}-${itemIndex}`} className="relative bg-neutral-900 overflow-hidden">
                  <Image
                    src={item.thumbnailPath}
                    alt=""
                    width={300}
                    height={Math.round(300 * (item.height / item.width))}
                    className="w-full block"
                    sizes="17vw"
                  />
                </div>
              )
            } else if (item.type === 'film') {
              return (
                <div
                  key={`film-${item.id}-${itemIndex}`}
                  className="bg-neutral-900 border border-neutral-800 overflow-hidden"
                >
                  <div className="aspect-square bg-neutral-800 flex items-center justify-center p-4">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={150}
                        height={150}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <svg className="w-12 h-12 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] text-[#D32F2F] uppercase tracking-wider">Film</div>
                    <div className="text-white text-xs font-bold truncate">
                      {item.brand ? `${item.brand} ${item.name}` : item.name}
                    </div>
                  </div>
                </div>
              )
            } else {
              return (
                <div
                  key={`camera-${item.id}-${itemIndex}`}
                  className="bg-neutral-900 border border-neutral-800 overflow-hidden"
                >
                  <div className="aspect-square bg-neutral-800 flex items-center justify-center p-4">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={150}
                        height={150}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <svg className="w-12 h-12 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] text-[#D32F2F] uppercase tracking-wider">Camera</div>
                    <div className="text-white text-xs font-bold truncate">
                      {item.brand ? `${item.brand} ${item.name}` : item.name}
                    </div>
                  </div>
                </div>
              )
            }
          })}
        </div>
      ))}
    </div>
  )
}
