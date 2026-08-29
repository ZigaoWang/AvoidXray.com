'use client'

import { useEffect, useRef, useCallback } from 'react'
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

export type MasonryItem = PhotoItem | FilmItem | CameraItem


/**
 * Column count. Fixed, and never recomputed on the client.
 *
 * This used to read window.innerWidth through useSyncExternalStore and pack
 * the items into 4, 6 or 8 columns to suit. The server has no viewport, so it
 * always emitted 8 — and on any narrower screen the first client render
 * repacked all 120 tiles into a different arrangement. Measured, that was a
 * single 0.14 layout shift about 1.4s in, which landed while the images were
 * still arriving and so read as the grid filling in and heaving around.
 *
 * The columns are now always packed for 8 and the extra ones are hidden with
 * CSS at narrower widths, so the server markup is already correct at every
 * breakpoint. A display:none column never generates a layout box, so its lazy
 * images are never fetched either — narrow screens now pull roughly half the
 * thumbnails they used to.
 */
const COLUMN_COUNT = 8

/**
 * Which columns survive at each breakpoint, matching the counts the old
 * viewport read used: 4 below sm, 6 below lg, 8 above.
 */
function columnVisibility(index: number): string {
  if (index < 4) return 'flex'
  if (index < 6) return 'hidden sm:flex'
  return 'hidden lg:flex'
}

/** Mirrors columnVisibility, for counting the images that will actually load. */
function visibleColumnCount(): number {
  if (typeof window === 'undefined') return COLUMN_COUNT
  if (window.matchMedia('(min-width: 1024px)').matches) return 8
  if (window.matchMedia('(min-width: 640px)').matches) return 6
  return 4
}

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
  const loadedCount = useRef(0)
  const totalImages = useRef(0)
  const readyCalled = useRef(false)

  const columns = calculateColumns(items, COLUMN_COUNT)

  // Count total images that need to load
  useEffect(() => {
    // Only the columns this breakpoint actually shows. Counting all eight
    // would mean a phone, which renders four, could never reach the 60%
    // threshold below and would always wait out the timeout instead.
    // Reading matchMedia here is safe: it is an effect, so it cannot
    // desynchronise the server and client renders the way the old viewport
    // read did.
    const visible = calculateColumns(items, COLUMN_COUNT)
      .slice(0, visibleColumnCount())
      .flat()

    totalImages.current = visible.filter(item => {
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

  if (items.length === 0) return null

  return (
    <div className="absolute inset-0 flex gap-[2px] overflow-hidden">
      {columns.map((col, colIndex) => (
        <div
          key={colIndex}
          className={`flex-1 ${columnVisibility(colIndex)} flex-col gap-[2px]`}
        >
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
