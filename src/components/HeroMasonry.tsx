'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { blurPlaceholder } from '@/lib/blurhash'
import { photoAlt, gearImageAlt } from '@/lib/seo/alt'

interface PhotoItem {
  type: 'photo'
  id: string
  thumbnailPath: string
  width: number
  height: number
  blurHash?: string | null
  caption?: string | null
  filmStock?: { name: string; brand?: string | null } | null
  camera?: { name: string; brand?: string | null } | null
  user?: { name?: string | null; username: string } | null
}

interface FilmItem {
  type: 'film'
  id: string
  slug?: string | null
  name: string
  brand: string | null
  imageUrl: string | null
}

interface CameraItem {
  type: 'camera'
  id: string
  slug?: string | null
  name: string
  brand: string | null
  imageUrl: string | null
}

type MasonryItem = PhotoItem | FilmItem | CameraItem

interface HeroMasonryProps {
  items: MasonryItem[]
  onReady?: () => void
}

// Pre-calculate columns for different breakpoints on the server
function calculateColumns(items: MasonryItem[], columnCount: number): MasonryItem[][] {
  const cols: MasonryItem[][] = Array.from({ length: columnCount }, () => [])
  const heights = Array(columnCount).fill(0)

  items.forEach(item => {
    const shortestCol = heights.indexOf(Math.min(...heights))
    cols[shortestCol].push(item)

    if (item.type === 'photo') {
      heights[shortestCol] += item.height / item.width
    } else {
      heights[shortestCol] += 0.75
    }
  })

  return cols
}

/**
 * The hero is a full-viewport masonry background, so unlike a scrolling grid its
 * top rows really are all visible at once. Budget is per column rather than
 * global: only the first few items down each column are on screen before the
 * fold, and beyond that the placeholder is never seen.
 */
const HERO_BLUR_PER_COLUMN = 4

export default function HeroMasonry({ items, onReady }: HeroMasonryProps) {
  const [mounted, setMounted] = useState(false)
  const [columnCount, setColumnCount] = useState(8)
  const loadedCount = useRef(0)
  const totalImages = useRef(0)
  const readyCalled = useRef(false)

  // Count total images that need to load
  useEffect(() => {
    totalImages.current = items.filter(item => {
      if (item.type === 'photo') return true
      if ((item.type === 'film' || item.type === 'camera') && item.imageUrl) return true
      return false
    }).length

    // If no images, mark as ready immediately
    if (totalImages.current === 0 && !readyCalled.current) {
      readyCalled.current = true
      onReady?.()
    }
  }, [items, onReady])

  // Set column count immediately on mount (before paint)
  useEffect(() => {
    const getColumnCount = () => {
      if (window.innerWidth < 640) return 4
      if (window.innerWidth < 1024) return 6
      return 8
    }

    setColumnCount(getColumnCount())
    setMounted(true)

    const handleResize = () => setColumnCount(getColumnCount())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleImageLoad = useCallback(() => {
    loadedCount.current++
    // Trigger ready when 60% of images are loaded
    if (loadedCount.current >= totalImages.current * 0.6 && !readyCalled.current) {
      readyCalled.current = true
      onReady?.()
    }
  }, [onReady])

  // Fallback timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyCalled.current) {
        readyCalled.current = true
        onReady?.()
      }
    }, 2500)

    return () => clearTimeout(timeout)
  }, [onReady])

  const columns = calculateColumns(items, columnCount)

  if (items.length === 0) return null

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return <div className="absolute inset-0 bg-neutral-900" />
  }

  return (
    <div className="absolute inset-0 flex gap-[2px] overflow-hidden">
      {columns.map((col, colIndex) => (
        <div key={colIndex} className="flex-1 flex flex-col gap-[2px]">
          {col.map((item, itemIndex) => {
            if (item.type === 'photo') {
              const aspectRatio = item.width / item.height
              return (
                <div
                  key={`${item.id}-${itemIndex}`}
                  className="relative w-full bg-neutral-900 overflow-hidden flex-shrink-0"
                  style={{ aspectRatio: aspectRatio }}
                >
                  <Image
                    src={item.thumbnailPath}
                    alt={photoAlt(item)}
                    fill
                    className="object-cover"
                    sizes="12.5vw"
                    {...blurPlaceholder(item.blurHash, itemIndex, HERO_BLUR_PER_COLUMN)}
                    onLoad={handleImageLoad}
                  />
                </div>
              )
            } else if (item.type === 'film') {
              return (
                <div
                  key={`film-${item.id}-${itemIndex}`}
                  className="relative bg-neutral-800 overflow-hidden flex-shrink-0"
                  style={{ aspectRatio: '1 / 0.75' }}
                >
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={gearImageAlt(item, 'film')}
                      fill
                      className="object-contain p-1"
                      sizes="12.5vw"
                      onLoad={handleImageLoad}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                    </div>
                  )}
                </div>
              )
            } else {
              return (
                <div
                  key={`camera-${item.id}-${itemIndex}`}
                  className="relative bg-neutral-800 overflow-hidden flex-shrink-0"
                  style={{ aspectRatio: '1 / 0.75' }}
                >
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={gearImageAlt(item, 'camera')}
                      fill
                      className="object-contain p-1"
                      sizes="12.5vw"
                      onLoad={handleImageLoad}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  )}
                </div>
              )
            }
          })}
        </div>
      ))}
    </div>
  )
}
