'use client'

import { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import QuickLikeButton from './QuickLikeButton'
import { blurPlaceholder, BLUR_PLACEHOLDER_COUNT } from '@/lib/blurhash'
import { photoAlt } from '@/lib/seo/alt'

/**
 * Tiles rendered before the reader scrolls, in static mode.
 *
 * A grid given its photos up front used to render every one of them. A profile
 * with 573 photos emitted 1.8MB of HTML, 838KB of it srcset candidates for
 * tiles far below the fold. The images themselves were already lazy, but the
 * markup, the RSC payload and the blurhash decoding were not.
 */
const STATIC_PAGE_SIZE = 24

/**
 * How many photos each network page fetches in infinite mode.
 *
 * Larger batches mean fewer round trips, so fewer opportunities for the reader
 * to catch one in progress. The API caps limit at 50.
 */
const FETCH_PAGE_SIZE = 30

/**
 * How far ahead each mode starts loading.
 *
 * Static reveals are instant — the photos are already in memory — so a modest
 * head start is enough. A network page takes around 0.7s to come back, so
 * infinite mode has to start far enough ahead that the response has arrived
 * before the reader reaches the end. Without this the fetch only began once the
 * sentinel was on screen, which is exactly when the spinner became visible.
 */
const STATIC_REVEAL_MARGIN = '600px'
const FETCH_AHEAD_MARGIN = '1000px'

/** No-op subscription: the hydration snapshot never changes after mount. */
const subscribeNever = () => () => {}

interface Photo {
  id: string
  thumbnailPath: string
  /**
   * 1600px edition. Preferred as the grid source: thumbnailPath is capped at
   * 800px, so on a retina display at 25vw the browser wants ~960px and Next
   * cannot supply it — the tile is upscaled and looks soft. Next still resizes
   * per `sizes`, so small viewports receive the same bytes either way; only
   * high-DPR viewports pay for the extra detail they actually asked for.
   */
  mediumPath?: string | null
  width: number
  height: number
  blurHash?: string | null
  liked?: boolean
  _count?: { likes: number }
  // Optional descriptive metadata. Present, these become the image's alt text —
  // the only thing describing a film scan to Google Images.
  caption?: string | null
  filmStock?: { name: string; brand?: string | null } | null
  camera?: { name: string; brand?: string | null } | null
  user?: { name?: string | null; username: string } | null
}

interface MasonryGridProps {
  photos?: Photo[]
  // For infinite scroll mode
  initialPhotos?: Photo[]
  initialOffset?: number | null
  tab?: string
  /**
   * Ordering seed for the random tab. Forwarded to /api/photos so the pages
   * fetched while scrolling continue the same shuffle the server rendered.
   * Cached with the photo list, so returning from a photo and scrolling on
   * stays in that ordering rather than jumping into a fresh one.
   */
  seed?: number
  /**
   * Extra query string narrowing the feed, e.g. `&filmStockId=…`. Lets a hub
   * grid page through the same endpoint explore uses rather than receiving
   * every photo up front.
   */
  scopeQuery?: string
  /** Reports the total matching the current scope, for a filter label. */
  onTotalChange?: (total: number | null) => void
  emptyMessage?: string
  emptyLink?: { href: string; text: string }
}

export default function MasonryGrid({
  photos: staticPhotos,
  initialPhotos,
  initialOffset,
  tab,
  seed,
  scopeQuery = '',
  onTotalChange,
  emptyMessage,
  emptyLink
}: MasonryGridProps) {
  const [photos, setPhotos] = useState<Photo[]>(() => {
    if (typeof window !== 'undefined' && initialPhotos !== undefined) {
      const saved = sessionStorage.getItem('masonry-photos-' + window.location.pathname)
      if (saved) return JSON.parse(saved)
    }
    return staticPhotos || initialPhotos || []
  })
  const [offset, setOffset] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && initialPhotos !== undefined) {
      const saved = sessionStorage.getItem('masonry-offset-' + window.location.pathname)
      if (saved) return JSON.parse(saved)
    }
    return initialOffset ?? null
  })
  const [activeSeed, setActiveSeed] = useState<number | undefined>(seed)
  const feedKey = `${tab ?? ''}|${scopeQuery}|${seed ?? ''}`

  // Carried into each photo's URL so its prev/next walk this list rather than
  // every photo on the site. scopeQuery arrives as "&key=value" pairs; the
  // photo page reads the scope keys and ignores the rest.
  const photoContext = scopeQuery ? `?${scopeQuery.replace(/^&/, '')}` : ''
  const lastFeedKey = useRef(feedKey)
  const [loading, setLoading] = useState(false)
  const [columnCount, setColumnCount] = useState(4)
  // Static mode reveals photos progressively. Starts at the same value on the
  // server and the client; anything restored from a previous visit is applied
  // after mount so the two renders agree.
  const [visibleCount, setVisibleCount] = useState(STATIC_PAGE_SIZE)
  // Scroll position waiting for its tiles to exist before it can be applied.
  const pendingScroll = useRef<number | null>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const isInfiniteMode = initialPhotos !== undefined
  const pathname = usePathname()
  const scrollRestored = useRef(false)
  const restoringScroll = useRef(
    typeof window !== 'undefined' && !!sessionStorage.getItem('masonry-' + window.location.pathname + '-scroll')
  )

  useEffect(() => {
    history.scrollRestoration = 'manual'
    if (scrollRestored.current) return
    const y = sessionStorage.getItem('masonry-' + pathname + '-scroll')
    if (y && photos.length > 0) {
      scrollRestored.current = true
      restoringScroll.current = true
      const targetY = parseInt(y)
      const savedVisible = parseInt(sessionStorage.getItem('masonry-visible-' + pathname) || '0')
      sessionStorage.removeItem('masonry-' + pathname + '-scroll')
      sessionStorage.removeItem('masonry-photos-' + pathname)
      sessionStorage.removeItem('masonry-offset-' + pathname)
      sessionStorage.removeItem('masonry-visible-' + pathname)
      const savedSeed = sessionStorage.getItem('masonry-seed-' + pathname)
      sessionStorage.removeItem('masonry-seed-' + pathname)
      // Continue the shuffle the reader was already browsing, not the fresh one
      // this request generated.
      if (savedSeed !== null) setActiveSeed(Number(savedSeed))

      // Scrolling before the tiles exist lands short, so in static mode the
      // reveal is restored first and the scroll waits for it to render.
      if (!isInfiniteMode && savedVisible > STATIC_PAGE_SIZE) {
        pendingScroll.current = targetY
        setVisibleCount(savedVisible)
      } else {
        setTimeout(() => {
          window.scrollTo(0, targetY)
          setTimeout(() => { restoringScroll.current = false }, 500)
        }, 0)
      }
    }
  }, [pathname, photos, isInfiniteMode])

  // Runs once the restored tiles are in the DOM.
  useEffect(() => {
    if (pendingScroll.current === null) return
    const targetY = pendingScroll.current
    pendingScroll.current = null
    requestAnimationFrame(() => {
      window.scrollTo(0, targetY)
      setTimeout(() => { restoringScroll.current = false }, 500)
    })
  }, [visibleCount])

  const handlePhotoClick = useCallback(() => {
    const key = 'masonry-' + pathname
    sessionStorage.setItem(key + '-scroll', String(window.scrollY))
    if (!isInfiniteMode) {
      sessionStorage.setItem('masonry-visible-' + pathname, String(visibleCount))
    }
    if (isInfiniteMode) {
      sessionStorage.setItem('masonry-photos-' + pathname, JSON.stringify(photos))
      sessionStorage.setItem('masonry-offset-' + pathname, JSON.stringify(offset))
      if (activeSeed !== undefined) {
        sessionStorage.setItem('masonry-seed-' + pathname, String(activeSeed))
      }
    }
  }, [pathname, photos, offset, isInfiniteMode, visibleCount, activeSeed])

  // Server-rendered HTML carries base64 placeholders only for the first screen
  // of images; the rest are decoded in the browser from the blurhash strings
  // that ship with the props anyway.
  //
  // useSyncExternalStore is the hydration check rather than a mount effect: it
  // returns the server snapshot during hydration and the client one afterwards,
  // so the first client render matches the server without a setState pass.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)

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

  // Update photos when static props change. A new array means the caller
  // filtered or re-sorted — the profile page does this for gear, day and sort —
  // so the reveal starts over. Skipped while restoring, which supplies its own
  // count and would otherwise be clobbered.
  useEffect(() => {
    if (staticPhotos) {
      setPhotos(staticPhotos)
      if (!restoringScroll.current) setVisibleCount(STATIC_PAGE_SIZE)
    }
  }, [staticPhotos])

  // Reset when tab changes (infinite mode)
  useEffect(() => {
    if (isInfiniteMode && initialPhotos && !restoringScroll.current) {
      setPhotos(initialPhotos)
      setOffset(initialOffset ?? null)
      setActiveSeed(seed)
      lastFeedKey.current = `${tab ?? ''}|${scopeQuery}|${seed ?? ''}`
    }
    // Keyed on the array identity rather than on tab, so this only runs when the
    // server actually sent a new first page — a navigation. A filter change on
    // the profile happens without one, and would otherwise be overwritten here
    // with the stale page the server rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInfiniteMode, initialPhotos, initialOffset])

  // Infinite mode already holds only what it has fetched; static mode holds
  // everything and reveals it a screen at a time.
  const visiblePhotos = useMemo(
    () => (isInfiniteMode ? photos : photos.slice(0, visibleCount)),
    [photos, visibleCount, isInfiniteMode]
  )
  const hasMoreStatic = !isInfiniteMode && visibleCount < photos.length

  const loadMore = useCallback(async () => {
    if (!isInfiniteMode || loading || offset === null || !tab) return
    setLoading(true)

    // A failure here used to leave `loading` stuck true, which permanently
    // disabled infinite scroll for the rest of the visit — one dropped request
    // on a flaky connection and the feed simply stopped. Offset is left
    // untouched on failure so the next scroll retries the same page.
    try {
      const seedParam = activeSeed === undefined ? '' : `&seed=${activeSeed}`
      const res = await fetch(
        `/api/photos?tab=${tab}&offset=${offset}&limit=${FETCH_PAGE_SIZE}${seedParam}${scopeQuery}`
      )
      if (!res.ok) return

      const data = await res.json()
      if (!Array.isArray(data?.photos)) return

      if (data.photos.length > 0) {
        const existingIds = new Set(photos.map(p => p.id))
        const newPhotos = data.photos.filter((p: Photo) => !existingIds.has(p.id))
        if (newPhotos.length > 0) {
          setPhotos(prev => [...prev, ...newPhotos])
        }
      }
      setOffset(data.nextOffset ?? null)
    } catch {
      // Network error; the sentinel will trigger another attempt on scroll.
    } finally {
      setLoading(false)
    }
  }, [isInfiniteMode, offset, loading, tab, photos, activeSeed, scopeQuery])

  useEffect(() => {
    if (!isInfiniteMode) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && offset !== null && !loading && !restoringScroll.current) {
          loadMore()
        }
      },
      { rootMargin: FETCH_AHEAD_MARGIN, threshold: 0 }
    )

    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [isInfiniteMode, offset, loading, loadMore])

  // Refetch from the first page when the caller changes what the feed is.
  //
  // The profile filters by gear, day and sort without a navigation, so the
  // server-rendered first page no longer matches what is being asked for. The
  // previous photos are kept on screen while the new ones load, so switching a
  // filter dims rather than blanks the grid.
  useEffect(() => {
    if (!isInfiniteMode || lastFeedKey.current === feedKey) return
    lastFeedKey.current = feedKey
    if (restoringScroll.current) return

    let cancelled = false
    setLoading(true)
    const seedParam = seed === undefined ? '' : `&seed=${seed}`
    fetch(`/api/photos?tab=${tab}&offset=0&limit=${FETCH_PAGE_SIZE}${seedParam}${scopeQuery}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !Array.isArray(data?.photos)) return
        setPhotos(data.photos)
        setOffset(data.nextOffset ?? null)
        setActiveSeed(seed)
        onTotalChange?.(typeof data.total === 'number' ? data.total : null)
        window.scrollTo({ top: 0 })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [feedKey, isInfiniteMode, tab, scopeQuery, seed, onTotalChange])

  // Static mode: no fetching, just reveal more of what is already in memory.
  // rootMargin starts the reveal before the sentinel is actually on screen, so
  // tiles are in place by the time the reader reaches them.
  useEffect(() => {
    if (isInfiniteMode || !hasMoreStatic) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !restoringScroll.current) {
          setVisibleCount(current => Math.min(current + STATIC_PAGE_SIZE, photos.length))
        }
      },
      { rootMargin: STATIC_REVEAL_MARGIN, threshold: 0 }
    )

    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [isInfiniteMode, hasMoreStatic, photos.length])

  // Decoding is memoised because infinite scroll re-renders this list often and
  // a decode per photo per render would be wasted work.
  const placeholders = useMemo(() => {
    const limit = hydrated ? Number.POSITIVE_INFINITY : BLUR_PLACEHOLDER_COUNT
    return new Map(
      visiblePhotos.map((photo, index) => [photo.id, blurPlaceholder(photo.blurHash, index, limit)])
    )
  }, [visiblePhotos, hydrated])

  const columns = useMemo(() => {
    const cols: Photo[][] = Array.from({ length: columnCount }, () => [])
    const heights = Array(columnCount).fill(0)

    visiblePhotos.forEach(photo => {
      const shortestCol = heights.indexOf(Math.min(...heights))
      cols[shortestCol].push(photo)
      heights[shortestCol] += photo.height / photo.width
    })

    return cols
  }, [visiblePhotos, columnCount])

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
              <Link key={photo.id} href={`/photos/${photo.id}${photoContext}`} className="group relative block" onClick={handlePhotoClick}>
                <div className="relative bg-neutral-900 overflow-hidden">
                  <Image
                    src={photo.mediumPath || photo.thumbnailPath}
                    alt={photoAlt(photo)}
                    width={400}
                    height={Math.round(400 * (photo.height / photo.width))}
                    className="w-full block"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    {...(placeholders.get(photo.id) ?? { placeholder: 'empty' as const })}
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

      {isInfiniteMode ? (
        <div ref={loaderRef} className="py-8 text-center">
          {loading && (
            <div className="inline-block w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          )}
          {offset === null && photos.length > 0 && (
            <p className="text-neutral-600 text-sm">You&apos;ve seen all photos</p>
          )}
        </div>
      ) : hasMoreStatic ? (
        <div ref={loaderRef} className="py-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : null}
    </>
  )
}
