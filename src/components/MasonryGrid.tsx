'use client'

import { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import QuickLikeButton from './QuickLikeButton'
import { blurPlaceholder, BLUR_PLACEHOLDER_COUNT } from '@/lib/blurhash'
import { photoAlt } from '@/lib/seo/alt'
import EmptyState from './ui/EmptyState'
import Button from './ui/Button'

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

/**
 * Columns per breakpoint, widest first.
 *
 * These are the two widths the tiles' `sizes` attribute and MasonrySkeleton's
 * hidden columns are written against, and they are Tailwind's sm and lg. All of
 * them have to keep agreeing: a tile in a column narrower than `sizes` claims
 * downloads a source it cannot show, and a skeleton in different columns than
 * the photos replacing it is a re-layout on arrival.
 */
const COLUMN_QUERIES: ReadonlyArray<readonly [query: string, columns: number]> = [
  ['(min-width: 1024px)', 4],
  ['(min-width: 640px)', 3]
]

/**
 * Columns below the narrowest query, and so the count the server emits.
 *
 * The server has no viewport and one number has to ship in the HTML, so this is
 * a bet on who is reading. It used to be 4: every phone painted four columns of
 * tiny tiles and then repacked to two the moment hydration measured the window,
 * which is the majority of visits taking the entire grid's worth of shift.
 */
const PHONE_COLUMN_COUNT = 2

function subscribeColumnCount(onStoreChange: () => void) {
  const lists = COLUMN_QUERIES.map(([query]) => window.matchMedia(query))
  lists.forEach(list => list.addEventListener('change', onStoreChange))
  return () => lists.forEach(list => list.removeEventListener('change', onStoreChange))
}

function readColumnCount(): number {
  const match = COLUMN_QUERIES.find(([query]) => window.matchMedia(query).matches)
  return match ? match[1] : PHONE_COLUMN_COUNT
}

/**
 * Parses a value the grid saved for the current path, or `undefined` when there
 * is nothing usable there.
 *
 * Stored state is not guaranteed to be well formed. A write that hits the
 * storage quota can leave a truncated string behind, and a key written by an
 * older deploy outlives the shape it was written for. Parsing that threw, and
 * because the parse happens inside a state initializer the throw landed during
 * render and took the whole grid down. Callers check the shape of what comes
 * back and fall through to loading the feed normally.
 */
function readSavedState(key: string): unknown {
  const saved = sessionStorage.getItem(key + window.location.pathname)
  if (saved === null) return undefined
  try {
    return JSON.parse(saved)
  } catch {
    return undefined
  }
}

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
  /**
   * The scope `initialPhotos` was rendered for, when it differs from
   * `scopeQuery`. Needed by callers that apply a filter on the client without
   * a navigation: without it the grid cannot tell that the page it was handed
   * predates the filter, and shows unfiltered photos under a filter bar.
   */
  initialScopeQuery?: string
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
  initialScopeQuery,
  onTotalChange,
  emptyMessage,
  emptyLink
}: MasonryGridProps) {
  const feedKey = `${tab ?? ''}|${scopeQuery}|${seed ?? ''}`

  /**
   * The feed `initialPhotos` actually belongs to.
   *
   * Usually the same as `feedKey`, but not always, and the difference matters.
   * Choosing a camera on the profile's Stats panel also switches back to the
   * Photos tab, which unmounts and remounts this component. On remount every
   * ref starts fresh, so a `lastFeedKey` seeded from `feedKey` recorded the
   * *filtered* key as already-loaded — and the effect that fetches on a scope
   * change concluded nothing had changed. The filter bar appeared, the grid
   * kept the unfiltered page the server had rendered, and no request was ever
   * made. Callers whose server-rendered page ignores the active filter pass
   * `initialScopeQuery` so the mismatch is visible here on the first render.
   */
  const initialFeedKey = `${tab ?? ''}|${initialScopeQuery ?? scopeQuery}|${seed ?? ''}`
  const serverPageMatchesScope = initialFeedKey === feedKey

  /**
   * Saved photos belong to the feed that was on screen when they were saved.
   * Restoring them into a different one put a filtered set under an unfiltered
   * header, and the next scroll then appended unfiltered pages on top.
   */
  const savedFeedMatches = () =>
    typeof window !== 'undefined' &&
    sessionStorage.getItem('masonry-feed-' + window.location.pathname) === feedKey

  const [photos, setPhotos] = useState<Photo[]>(() => {
    if (typeof window !== 'undefined' && initialPhotos !== undefined && savedFeedMatches()) {
      const saved = readSavedState('masonry-photos-')
      if (Array.isArray(saved)) return saved
    }
    // Starting empty when the server's page is for a different scope. Showing
    // it would be showing photos that do not match the filter on screen.
    if (initialPhotos !== undefined && !serverPageMatchesScope) return []
    return staticPhotos || initialPhotos || []
  })
  const [offset, setOffset] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && initialPhotos !== undefined && savedFeedMatches()) {
      // A stored `null` is meaningful here: it is the feed reporting that it had
      // reached the end, so it is restored rather than treated as missing.
      const saved = readSavedState('masonry-offset-')
      if (typeof saved === 'number' || saved === null) return saved
    }
    if (initialPhotos !== undefined && !serverPageMatchesScope) return 0
    return initialOffset ?? null
  })
  const [activeSeed, setActiveSeed] = useState<number | undefined>(seed)

  // Carried into each photo's URL so its prev/next walk this list rather than
  // every photo on the site. scopeQuery arrives as "&key=value" pairs; the
  // photo page reads the scope keys and ignores the rest.
  const photoContext = scopeQuery ? `?${scopeQuery.replace(/^&/, '')}` : ''
  // The feed whose photos are on screen, or null when a fetch for a new one
  // failed and left the grid holding nothing.
  const lastFeedKey = useRef<string | null>(initialFeedKey)
  // Always the feed currently on screen. A request that finishes after the
  // filter changed compares against this and drops its result.
  const feedKeyRef = useRef(feedKey)
  useEffect(() => {
    feedKeyRef.current = feedKey
  }, [feedKey])
  const [loading, setLoading] = useState(false)
  /**
   * The offset whose request failed, if one did.
   *
   * The sentinel observer re-runs whenever `loading` flips, and re-observing a
   * target that is already on screen makes IntersectionObserver fire straight
   * away. So a failed page used to be retried the instant it failed, forever:
   * one dropped request on a flaky connection, or a 502 during a deploy, and
   * the grid hammered /api/photos in a continuous loop with nothing on screen
   * to say anything was wrong.
   *
   * Holding the offset rather than a boolean means a later, different page can
   * still load automatically; only the one that failed waits to be asked again.
   */
  const [failedOffset, setFailedOffset] = useState<number | null>(null)
  /**
   * Columns, read from matchMedia rather than corrected after mount.
   *
   * useSyncExternalStore hands the server snapshot back during hydration, so
   * the first client render agrees with the HTML by construction; a mount effect
   * could only disagree with it and then setState, which is the repack itself.
   *
   * Wide screens still repack once, after hydration, and that is as far as this
   * goes. HeroMasonry gets server markup that is correct at every breakpoint by
   * packing for its widest case and hiding the surplus columns with CSS, but it
   * can only do that because the items in those columns are a decorative
   * background and losing them is invisible. Every feed on the site renders
   * through this grid, so the columns a breakpoint hides would be photos the
   * reader never sees.
   */
  const columnCount = useSyncExternalStore(
    subscribeColumnCount,
    readColumnCount,
    () => PHONE_COLUMN_COUNT
  )
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
    typeof window !== 'undefined' &&
      !!sessionStorage.getItem('masonry-' + window.location.pathname + '-scroll') &&
      (!isInfiniteMode || savedFeedMatches())
  )

  /**
   * Bumped when a scroll restoration finishes, and read by the two observer
   * effects below so they tear down and re-observe.
   *
   * Coming back from a photo lands you where you were, which is usually near
   * the end of the list, so the sentinel is already inside the fetch-ahead
   * margin. IntersectionObserver reports that once, when `observe` is called,
   * and then only reports *changes* — and that one report arrives during the
   * restore window, where it is deliberately ignored. The sentinel then stays
   * intersecting, no further callback is ever produced, and the feed stops
   * loading until you scroll far enough up to push the sentinel out and back
   * in again.
   *
   * Re-observing after the restore asks the question again, with the answer
   * now allowed to count.
   */
  /** Timers scheduled by the restore, so unmount can cancel them. */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [restoreTick, setRestoreTick] = useState(0)
  const endRestore = useCallback(() => {
    restoringScroll.current = false
    setRestoreTick(tick => tick + 1)
  }, [])

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
      sessionStorage.removeItem('masonry-feed-' + pathname)
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
        const outer = setTimeout(() => {
          window.scrollTo(0, targetY)
          timers.current.push(setTimeout(endRestore, 500))
        }, 0)
        timers.current.push(outer)
      }
    }
  }, [pathname, photos, isInfiniteMode, endRestore])

  // Runs once the restored tiles are in the DOM.
  useEffect(() => {
    if (pendingScroll.current === null) return
    const targetY = pendingScroll.current
    pendingScroll.current = null
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, targetY)
      timers.current.push(setTimeout(endRestore, 500))
    })
    return () => cancelAnimationFrame(frame)
  }, [visibleCount, endRestore])

  /**
   * Everything the restore schedules is canceled on unmount.
   *
   * The scroll is applied from a timer and an animation frame, and neither was
   * canceled — so leaving the page while one was pending ran
   * `window.scrollTo` against whatever had replaced it, and the page you had
   * just opened jumped to a position belonging to the grid you left.
   */
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.length = 0
    }
  }, [])

  const handlePhotoClick = useCallback(() => {
    const key = 'masonry-' + pathname
    sessionStorage.setItem(key + '-scroll', String(window.scrollY))
    if (!isInfiniteMode) {
      sessionStorage.setItem('masonry-visible-' + pathname, String(visibleCount))
    }
    if (isInfiniteMode) {
      // Stored with the photos so they are only ever restored into the same
      // feed: same tab, same scope, same seed.
      sessionStorage.setItem('masonry-feed-' + pathname, feedKey)
      sessionStorage.setItem('masonry-photos-' + pathname, JSON.stringify(photos))
      sessionStorage.setItem('masonry-offset-' + pathname, JSON.stringify(offset))
      if (activeSeed !== undefined) {
        sessionStorage.setItem('masonry-seed-' + pathname, String(activeSeed))
      }
    }
  }, [pathname, photos, offset, isInfiniteMode, visibleCount, activeSeed, feedKey])

  // Server-rendered HTML carries base64 placeholders only for the first screen
  // of images; the rest are decoded in the browser from the blurhash strings
  // that ship with the props anyway.
  //
  // useSyncExternalStore is the hydration check rather than a mount effect: it
  // returns the server snapshot during hydration and the client one afterwards,
  // so the first client render matches the server without a setState pass.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)

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
    // Also skipped when the server's page is for a different scope than the
    // one on screen. This effect runs on mount too, and adopting that page
    // would both display unfiltered photos and mark the filtered feed as
    // already loaded, so the fetch below would never run.
    if (isInfiniteMode && initialPhotos && !restoringScroll.current && serverPageMatchesScope) {
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
    // The feed this page was asked for. Clicking a film stock or camera on the
    // profile changes the scope without a navigation, and a page already in
    // flight for the old scope would otherwise append photos that do not match
    // the filter, and overwrite the offset with the unfiltered one so every
    // page after it was wrong too.
    const requestedFeed = feedKey
    setFailedOffset(null)

    try {
      const seedParam = activeSeed === undefined ? '' : `&seed=${activeSeed}`
      const res = await fetch(
        `/api/photos?tab=${tab}&offset=${offset}&limit=${FETCH_PAGE_SIZE}${seedParam}${scopeQuery}`
      )
      if (feedKeyRef.current !== requestedFeed) return
      if (!res.ok) {
        setFailedOffset(offset)
        return
      }

      const data = await res.json()
      if (feedKeyRef.current !== requestedFeed) return
      if (!Array.isArray(data?.photos)) {
        setFailedOffset(offset)
        return
      }

      if (data.photos.length > 0) {
        const existingIds = new Set(photos.map(p => p.id))
        const newPhotos = data.photos.filter((p: Photo) => !existingIds.has(p.id))
        if (newPhotos.length > 0) {
          setPhotos(prev => [...prev, ...newPhotos])
        }
      }
      setOffset(data.nextOffset ?? null)
    } catch {
      // Network error. Recorded rather than swallowed, so the reader gets a
      // Retry instead of a silent loop.
      if (feedKeyRef.current === requestedFeed) setFailedOffset(offset)
    } finally {
      setLoading(false)
    }
  }, [isInfiniteMode, offset, loading, tab, photos, activeSeed, scopeQuery, feedKey])

  useEffect(() => {
    if (!isInfiniteMode) return

    const observer = new IntersectionObserver(
      entries => {
        if (
          entries[0].isIntersecting &&
          offset !== null &&
          !loading &&
          failedOffset !== offset &&
          !restoringScroll.current
        ) {
          loadMore()
        }
      },
      { rootMargin: FETCH_AHEAD_MARGIN, threshold: 0 }
    )

    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [isInfiniteMode, offset, loading, loadMore, failedOffset, restoreTick])

  // Refetch from the first page when the caller changes what the feed is.
  //
  // The profile filters by gear, day and sort without a navigation, so the
  // server-rendered first page no longer matches what is being asked for. The
  // previous photos are kept on screen while the new ones load, so switching a
  // filter dims rather than blanks the grid.
  useEffect(() => {
    if (!isInfiniteMode || lastFeedKey.current === feedKey) return
    if (restoringScroll.current) {
      lastFeedKey.current = feedKey
      return
    }

    let canceled = false
    // A first page that never arrived used to be swallowed: the key had already
    // advanced, so the previous feed's photos and offset stayed on screen as
    // though they were the new feed's, with nothing offering a retry. The
    // photos go, and the failure is handed to the same Try again the sentinel
    // uses — at offset 0, which is the page that failed.
    const fail = () => {
      setPhotos([])
      setOffset(0)
      setActiveSeed(seed)
      setFailedOffset(0)
      onTotalChange?.(null)
    }
    setLoading(true)
    setFailedOffset(null)
    const seedParam = seed === undefined ? '' : `&seed=${seed}`
    fetch(`/api/photos?tab=${tab}&offset=0&limit=${FETCH_PAGE_SIZE}${seedParam}${scopeQuery}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (canceled) return
        if (!Array.isArray(data?.photos)) {
          lastFeedKey.current = null
          fail()
          return
        }
        setPhotos(data.photos)
        setOffset(data.nextOffset ?? null)
        setActiveSeed(seed)
        // Only now is this the feed on screen.
        lastFeedKey.current = feedKey
        onTotalChange?.(typeof data.total === 'number' ? data.total : null)
        window.scrollTo({ top: 0 })
      })
      .catch(() => {
        if (canceled) return
        // Left null rather than reverted, so switching back to the feed that
        // was showing before still counts as a change and fetches again.
        lastFeedKey.current = null
        fail()
      })
      .finally(() => { if (!canceled) setLoading(false) })

    return () => { canceled = true }
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
  }, [isInfiniteMode, hasMoreStatic, photos.length, restoreTick])

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

  // A failed page said nothing at all before, so the feed looked as though it
  // had simply ended. Shared with the empty return below, because a scope
  // change whose first page failed leaves no grid to hang this under.
  const loadFailed = isInfiniteMode && failedOffset !== null && failedOffset === offset
  const retryNotice = (
    <div role="alert" className="flex flex-col items-center gap-3">
      <p className="text-sm text-neutral-500">
        {photos.length === 0 ? 'Could not load photos.' : 'Could not load more photos.'}
      </p>
      <Button variant="outline" size="sm" onClick={() => loadMore()}>
        Try again
      </Button>
    </div>
  )

  if (photos.length === 0) {
    // Mid-fetch, not empty. Saying "no photos match this filter" before the
    // request has come back reads as a result, and the grid arriving a moment
    // later contradicts it.
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24" role="status" aria-label="Loading photos">
          <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
        </div>
      )
    }
    // Nor is a failed request an empty feed.
    if (loadFailed) return <div className="py-24">{retryNotice}</div>
    return (
      <EmptyState
        icon={
          <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        message={emptyMessage || 'No photos yet'}
        action={emptyLink ? { href: emptyLink.href, label: emptyLink.text } : undefined}
      />
    )
  }

  return (
    <>
      {/*
        Grid rather than flex, for the reason HeroMasonry spells out: `flex-1`
        divides the row between the children that exist *now*, so a long feed
        streaming in widens nothing and instead drags everything already painted
        sideways as each column arrives. A grid template declares the tracks up
        front, and the track count is the packed count so every column sits on
        one row.
      */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {columns.map((col, colIndex) => (
          <div key={colIndex} className="min-w-0 flex flex-col gap-4">
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
          {!loading && loadFailed && retryNotice}
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
