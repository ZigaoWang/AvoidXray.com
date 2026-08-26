'use client'

import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import Image from 'next/image'
import MasonryGrid from './MasonryGrid'
import { blurHashToDataURL } from '@/lib/blurhash'
import { displayName, gearImageAlt } from '@/lib/seo/alt'
import type { PhotoDay } from '@/lib/profileFeed'

interface PhotoThumb {
  id: string
  thumbnailPath: string
  blurHash: string | null
}

interface GearItem {
  id: string
  name: string
  brand: string | null
  count: number
  imageUrl: string | null
  imageStatus: string
  photos: PhotoThumb[]
  iso?: number | null       // films only
  cameraType?: string | null // cameras only
}

interface Photo {
  id: string
  thumbnailPath: string
  /** Preferred grid source; see MasonryGrid. Gear cards stay on the thumb. */
  mediumPath?: string | null
  width: number
  height: number
  blurHash?: string | null
  liked?: boolean
  _count?: { likes: number }
  createdAt?: string
  cameraId?: string | null
  filmStockId?: string | null
}

interface Props {
  /** First page only; the grid pages the rest through /api/photos. */
  photos: Photo[]
  initialOffset: number | null
  username: string
  totalPhotos: number
  /** Per-day counts for the heatmap, aggregated in UTC by the server. */
  photoDays: PhotoDay[]
  /** Daily seed from the server; keeps the featured order stable across renders. */
  featuredSeed: number
  cameraStats: GearItem[]
  filmStats: GearItem[]
  totalLikes: number
  joinedDate?: string
}

type Sort = 'featured' | 'recent'

type GearFilter = { type: 'camera' | 'film'; id: string; name: string } | null

export default function ProfileTabs({ photos, initialOffset, username, totalPhotos, photoDays, featuredSeed, cameraStats, filmStats, totalLikes, joinedDate }: Props) {
  const [activeTab, setActiveTab] = useState<'photos' | 'stats'>('photos')
  const [sort, setSort] = useState<Sort>('featured')
  const [gearFilter, setGearFilter] = useState<GearFilter>(null)
  const [dayFilter, setDayFilter] = useState<string | null>(null)

  // Sort and filters are query parameters now rather than array operations, so
  // the page no longer has to hold every photo in order to narrow them. The
  // sorts map onto feed tabs the API already implements: featured is a seeded
  // shuffle, recent is by date.
  const feedTab = sort === 'featured' ? 'random' : 'recent'
  // What the server actually rendered the first page for: this profile, with
  // no gear or day filter applied. Handed to the grid so it can tell whether
  // the page it was given already matches the filter on screen.
  const baseScopeQuery = useMemo(() => `&${new URLSearchParams({ username })}`, [username])
  const scopeQuery = useMemo(() => {
    const params = new URLSearchParams({ username })
    if (gearFilter?.type === 'camera') params.set('cameraId', gearFilter.id)
    if (gearFilter?.type === 'film') params.set('filmStockId', gearFilter.id)
    if (dayFilter) params.set('day', dayFilter)
    return `&${params.toString()}`
  }, [username, gearFilter, dayFilter])

  const [filteredTotal, setFilteredTotal] = useState<number | null>(null)
  const isFiltered = gearFilter !== null || dayFilter !== null

  function handleGearClick(type: 'camera' | 'film', id: string, name: string) {
    setGearFilter(prev => prev?.type === type && prev?.id === id ? null : { type, id, name })
    setDayFilter(null)
    setActiveTab('photos')
  }

  function handleDayClick(date: string, count: number) {
    if (count === 0) return
    setDayFilter(prev => prev === date ? null : date)
    setGearFilter(null)
    setActiveTab('photos')
  }

  const activeFilterLabel = dayFilter
    ? new Date(dayFilter + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : gearFilter
    ? gearFilter.name
    : null

  const activeFilterType = dayFilter ? 'Day' : gearFilter ? (gearFilter.type === 'camera' ? 'Camera' : 'Film') : null

  return (
    <>
      {/* Primary tab bar */}
      <div className="border-b border-neutral-800 sticky top-0 z-10 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex">
            {(['photos', 'stats'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`py-3.5 px-4 text-sm font-medium capitalize transition-colors border-b-2 ${
                  activeTab === t
                    ? 'text-white border-[#D32F2F]'
                    : 'text-neutral-500 hover:text-white border-transparent'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Sort toggle — right side, only on photos tab */}
          {activeTab === 'photos' && !gearFilter && !dayFilter && (
            <div className="flex items-center gap-0.5 bg-neutral-900">
              {(['featured', 'recent'] as Sort[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    sort === s ? 'bg-white text-black' : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTab === 'photos' && (
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Gear/day filter banner */}
          {activeFilterLabel && (
            <div className="flex items-center justify-between mb-6 px-4 py-2.5 bg-neutral-900 border border-neutral-800">
              <span className="text-sm text-neutral-300">
                <span className="text-neutral-600 mr-2">{activeFilterType}</span>
                {activeFilterLabel}
                {filteredTotal !== null && (
                  <span className="text-neutral-600 ml-2">· {filteredTotal} photo{filteredTotal !== 1 ? 's' : ''}</span>
                )}
              </span>
              <button
                onClick={() => { setGearFilter(null); setDayFilter(null) }}
                className="text-neutral-500 hover:text-white transition-colors ml-4"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <MasonryGrid
            initialPhotos={photos}
            initialOffset={initialOffset}
            tab={feedTab}
            seed={sort === 'featured' ? featuredSeed : undefined}
            scopeQuery={scopeQuery}
            initialScopeQuery={baseScopeQuery}
            onTotalChange={setFilteredTotal}
            emptyMessage={isFiltered ? 'No photos match this filter' : 'No photos yet'}
          />
        </div>
      )}

      {activeTab === 'stats' && (
        <StatsPanel
          totalPhotos={totalPhotos}
          photoDays={photoDays}
          cameraStats={cameraStats}
          filmStats={filmStats}
          totalLikes={totalLikes}
          onGearClick={handleGearClick}
          activeGearFilter={gearFilter}
          onDayClick={handleDayClick}
          joinedDate={joinedDate}
        />
      )}
    </>
  )
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

/**
 * Built from server-side per-day counts.
 *
 * The counts used to be derived here from every photo, keyed by the viewer's
 * local date while the squares were labelled with UTC dates — so the same
 * profile drew differently in different timezones and, near midnight, a square
 * disagreed with its own tooltip. Both sides are UTC now.
 */
function buildHeatmap(photoDays: PhotoDay[]) {
  const counts = new Map<string, number>(photoDays.map(d => [d.date, d.count]))
  const today = new Date()
  const start = new Date(today)
  start.setFullYear(start.getFullYear() - 1)
  start.setDate(start.getDate() - start.getDay()) // align to Sunday
  const weeks: Array<Array<{ date: string; count: number }>> = []
  const cur = new Date(start)
  for (let w = 0; w < 53; w++) {
    const week: Array<{ date: string; count: number }> = []
    for (let d = 0; d < 7; d++) {
      const iso = cur.toISOString().split('T')[0]
      week.push({ date: iso, count: counts.get(iso) ?? 0 })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  const max = Math.max(...Array.from(counts.values()), 1)
  return { weeks, max, counts }
}

const GAP = 3
const MIN_CELL = 14

function heatStyle(count: number, max: number): React.CSSProperties {
  if (count === 0) return { backgroundColor: '#1a1a1a' }
  const r = count / max
  if (r <= 0.25) return { backgroundColor: '#4a0e0e' }
  if (r <= 0.5)  return { backgroundColor: '#7a1a1a' }
  if (r <= 0.75) return { backgroundColor: '#b02525' }
  return { backgroundColor: '#D32F2F' }
}

function formatTooltip(date: string, count: number): string {
  const d = new Date(date + 'T12:00:00')
  const day = d.toLocaleDateString('en-US', { weekday: 'short' })
  const full = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (count === 0) return full
  return `${count} photo${count !== 1 ? 's' : ''} — ${day}, ${full}`
}

function getMonthLabels(weeks: ReturnType<typeof buildHeatmap>['weeks']) {
  const labels: Array<{ label: string; col: number; isYear: boolean }> = []
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const d = new Date(week[0].date + 'T12:00:00')
    const m = d.getMonth()
    if (m !== lastMonth) {
      const isJan = m === 0
      labels.push({
        label: isJan
          ? String(d.getFullYear())
          : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m],
        col: i,
        isYear: isJan
      })
      lastMonth = m
    }
  })
  return labels
}

function ActivityHeatmap({ photoDays, onDayClick, joinedDate }: {
  photoDays: PhotoDay[]
  onDayClick?: (date: string, count: number) => void
  joinedDate?: string
}) {
  const { weeks, max, counts } = useMemo(() => buildHeatmap(photoDays), [photoDays])
  const monthLabels = useMemo(() => getMonthLabels(weeks), [weeks])
  const containerRef = useRef<HTMLDivElement>(null)
  // Null until measured. Rendering at a guessed size and correcting afterwards
  // is what made the grid visibly jump when the stats tab opened.
  const [cellSize, setCellSize] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const w = el.clientWidth
      // Zero while the panel is still being laid out — this section mounts when
      // the stats tab is opened. Measuring then would clamp to MIN_CELL, paint,
      // and jump once ResizeObserver reported the real width, so wait instead.
      if (w === 0) return
      // 32px day-labels + 4px gap = 36px offset; 52 internal gaps between 53 columns
      const computed = Math.floor((w - 36 - 52 * GAP) / 53)
      const next = Math.max(MIN_CELL, computed)
      setCellSize(prev => (prev === next ? prev : next))
    }
    compute()
    const obs = new ResizeObserver(compute)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const colW = (cellSize ?? MIN_CELL) + GAP
  const needsScroll = cellSize === MIN_CELL
  // Seven rows plus their gaps, so the panel does not resize under the reader
  // in the rare frame before a width is available.
  const reservedHeight = 7 * (MIN_CELL + GAP)

  // Summed from the same aggregate the squares are drawn from, so the caption
  // and the grid can never disagree.
  const yearCount = useMemo(
    () => photoDays.reduce((sum, day) => sum + day.count, 0),
    [photoDays]
  )

  const totalDaysActive = useMemo(() => counts.size, [counts])

  return (
    <section ref={containerRef}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-y-2">
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Upload activity</h3>
          <p className="text-neutral-600 text-xs mt-0.5">
            {yearCount} photo{yearCount !== 1 ? 's' : ''} across {totalDaysActive} day{totalDaysActive !== 1 ? 's' : ''} this year
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-700">Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map(r => (
            <div
              key={r}
              style={{
                width: cellSize ?? MIN_CELL,
                height: cellSize ?? MIN_CELL,
                visibility: cellSize === null ? 'hidden' : 'visible',
                ...heatStyle(r === 0 ? 0 : r, 1),
              }}
            />
          ))}
          <span className="text-[10px] text-neutral-700">More</span>
        </div>
      </div>

      {/* grid — scrollable only when cells are at minimum size (small screens).
          Held back until the container has been measured; the height is reserved
          meanwhile so the panel does not resize under the reader. */}
      <div
        className={needsScroll ? 'overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]' : ''}
        style={cellSize === null ? { minHeight: reservedHeight } : undefined}
      >
        {cellSize !== null && (
        <div style={{ display: 'inline-block', minWidth: needsScroll ? 53 * colW + 36 : undefined }}>
          {/* Month labels */}
          <div className="relative mb-1" style={{ height: 16, marginLeft: 36 }}>
            {monthLabels.map(({ label, col, isYear }) => (
              <span
                key={col}
                className={`absolute text-[10px] font-medium ${isYear ? 'text-neutral-400' : 'text-neutral-600'}`}
                style={{ left: col * colW }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex" style={{ gap: GAP }}>
            {/* Day labels */}
            <div className="flex flex-col shrink-0" style={{ gap: GAP, width: 32 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                <div
                  key={d}
                  className="text-[10px] text-neutral-700 flex items-center justify-end pr-1"
                  style={{ height: cellSize ?? MIN_CELL, visibility: i % 2 === 0 ? 'hidden' : 'visible' }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map(({ date, count }) => {
                    const isJoinDay = joinedDate === date
                    const tooltipText = isJoinDay
                      ? (count > 0 ? `${formatTooltip(date, count)} · Joined AvoidXray` : 'Joined AvoidXray')
                      : formatTooltip(date, count)
                    const cellStyle = isJoinDay && count === 0
                      ? { backgroundColor: '#D32F2F' }
                      : heatStyle(count, max)
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => onDayClick?.(date, count)}
                        disabled={count === 0 && !isJoinDay}
                        onMouseEnter={e => setTooltip({ text: tooltipText, x: e.clientX, y: e.clientY })}
                        onMouseMove={e => setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                        onMouseLeave={() => setTooltip(null)}
                        className={`relative transition-all disabled:cursor-default ${
                          count > 0 ? 'hover:brightness-125 cursor-pointer' : 'cursor-default'
                        }`}
                        style={{ width: cellSize, height: cellSize, ...cellStyle }}
                      >
                        {isJoinDay && (
                          <svg viewBox="0 0 24 24" fill="white" className="absolute inset-0 w-full h-full p-[2px] opacity-90" aria-hidden>
                            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* fixed-position tooltip — never clipped by overflow containers */}
      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 text-[11px] text-white whitespace-nowrap shadow-xl"
          style={{ left: tooltip.x + 14, top: tooltip.y - 42 }}
        >
          {tooltip.text}
        </div>
      )}
    </section>
  )
}

// ─── Gear Cards (exact style from /cameras & /films) ─────────────────────────

function CameraCard({ item, onClick, isActive }: { item: GearItem; onClick: () => void; isActive: boolean }) {
  const displayImage = item.imageStatus === 'approved' ? item.imageUrl : null
  const photos = item.photos.slice(0, 4)
  const isDisposable = item.cameraType === 'Disposable'

  return (
    <button
      onClick={onClick}
      className={`group bg-neutral-900 border transition-colors overflow-hidden w-full text-left ${
        isActive ? 'border-[#D32F2F]' : 'border-neutral-800 hover:border-[#D32F2F]'
      }`}
    >
      <div className="grid grid-cols-4 gap-px bg-neutral-800">
        {photos.map(photo => (
          <div key={photo.id} className="aspect-square relative bg-neutral-900">
            <Image src={photo.thumbnailPath} alt={`Photo shot on a ${displayName(item) ?? item.name}`} fill className="object-cover" sizes="100px" placeholder={photo.blurHash ? 'blur' : 'empty'} blurDataURL={blurHashToDataURL(photo.blurHash)} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
          <div key={i} className="aspect-square bg-neutral-900" />
        ))}
      </div>
      <div className="p-4 flex items-center gap-4">
        <div className="relative w-32 h-24 flex-shrink-0">
          {displayImage ? (
            <Image src={displayImage} alt={gearImageAlt(item, 'camera')} fill className="object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-neutral-800 rounded">
              <svg className="w-12 h-12 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
              {item.brand ? `${item.brand} ${item.name}` : item.name}
            </h3>
            {isDisposable && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-amber-500/40 text-amber-400 bg-amber-500/10">
                Disposable
              </span>
            )}
          </div>
          <p className="text-neutral-500">{item.count} photo{item.count !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </button>
  )
}

function FilmCard({ item, onClick, isActive }: { item: GearItem; onClick: () => void; isActive: boolean }) {
  const displayImage = item.imageStatus === 'approved' ? item.imageUrl : null
  const photos = item.photos.slice(0, 4)

  return (
    <button
      onClick={onClick}
      className={`group bg-neutral-900 border transition-colors overflow-hidden w-full text-left ${
        isActive ? 'border-[#D32F2F]' : 'border-neutral-800 hover:border-[#D32F2F]'
      }`}
    >
      <div className="grid grid-cols-4 gap-px bg-neutral-800">
        {photos.map(photo => (
          <div key={photo.id} className="aspect-square relative bg-neutral-900">
            <Image src={photo.thumbnailPath} alt={`Photo shot on ${displayName(item) ?? item.name}`} fill className="object-cover" sizes="100px" placeholder={photo.blurHash ? 'blur' : 'empty'} blurDataURL={blurHashToDataURL(photo.blurHash)} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
          <div key={i} className="aspect-square bg-neutral-900" />
        ))}
      </div>
      <div className="p-4 flex items-center gap-4">
        <div className="relative w-32 h-24 flex-shrink-0">
          {displayImage ? (
            <Image src={displayImage} alt={gearImageAlt(item, 'film')} fill className="object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-neutral-800 rounded">
              <svg className="w-12 h-12 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
            {item.brand ? `${item.brand} ${item.name}` : item.name}
          </h3>
          <div className="flex items-center gap-2 text-neutral-500">
            {item.iso && <span>ISO {item.iso}</span>}
            {item.iso && <span>•</span>}
            <span>{item.count} photo{item.count !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Stats Panel ──────────────────────────────────────────────────────────────

function StatsPanel({ totalPhotos, photoDays, cameraStats, filmStats, totalLikes, onGearClick, activeGearFilter, onDayClick, joinedDate }: {
  totalPhotos: number
  photoDays: PhotoDay[]
  cameraStats: GearItem[]
  filmStats: GearItem[]
  totalLikes: number
  onGearClick: (type: 'camera' | 'film', id: string, name: string) => void
  activeGearFilter: GearFilter
  onDayClick: (date: string, count: number) => void
  joinedDate?: string
}) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-14">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border border-neutral-900">
        {[
          { label: 'Photos', value: totalPhotos },
          { label: 'Total likes', value: totalLikes },
          { label: 'Cameras', value: cameraStats.length },
          { label: 'Film stocks', value: filmStats.length },
        ].map(({ label, value }, i, arr) => (
          <div key={label} className={`px-6 py-6 ${i < arr.length - 1 ? 'border-r border-neutral-900' : ''}`}>
            <div className="text-3xl font-black text-white tracking-tight">{value.toLocaleString()}</div>
            <div className="text-xs text-neutral-600 mt-1.5 uppercase tracking-widest">{label}</div>
          </div>
        ))}
      </div>

      <ActivityHeatmap photoDays={photoDays} onDayClick={onDayClick} joinedDate={joinedDate} />

      {cameraStats.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-5">Cameras</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameraStats.map(cam => (
              <CameraCard
                key={cam.id}
                item={cam}
                onClick={() => onGearClick('camera', cam.id, cam.brand ? `${cam.brand} ${cam.name}` : cam.name)}
                isActive={activeGearFilter?.type === 'camera' && activeGearFilter?.id === cam.id}
              />
            ))}
          </div>
        </section>
      )}

      {filmStats.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-5">Film Stocks</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filmStats.map(film => (
              <FilmCard
                key={film.id}
                item={film}
                onClick={() => onGearClick('film', film.id, film.brand ? `${film.brand} ${film.name}` : film.name)}
                isActive={activeGearFilter?.type === 'film' && activeGearFilter?.id === film.id}
              />
            ))}
          </div>
        </section>
      )}

      {cameraStats.length === 0 && filmStats.length === 0 && totalPhotos > 0 && (
        <div className="py-12 border border-dashed border-neutral-800 text-center">
          <p className="text-neutral-600 text-sm">Tag photos with cameras and film stocks to see gear stats</p>
        </div>
      )}
    </div>
  )
}
