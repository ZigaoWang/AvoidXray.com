'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import MasonryGrid from './MasonryGrid'
import { blurHashToDataURL } from '@/lib/blurhash'

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
  photos: Photo[]
  cameraStats: GearItem[]
  filmStats: GearItem[]
  totalLikes: number
  joinedDate?: string
}

type Sort = 'featured' | 'recent'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type GearFilter = { type: 'camera' | 'film'; id: string; name: string } | null

export default function ProfileTabs({ photos, cameraStats, filmStats, totalLikes, joinedDate }: Props) {
  const [activeTab, setActiveTab] = useState<'photos' | 'stats'>('photos')
  const [sort, setSort] = useState<Sort>('featured')
  const [gearFilter, setGearFilter] = useState<GearFilter>(null)
  const [dayFilter, setDayFilter] = useState<string | null>(null)

  const featuredPhotos = useRef<Photo[]>(null as unknown as Photo[])
  if (!featuredPhotos.current) {
    featuredPhotos.current = shuffle(photos)
  }

  const basePhotos = sort === 'featured' ? featuredPhotos.current : photos

  const displayPhotos = useMemo(() => {
    let result = basePhotos
    if (gearFilter) {
      result = result.filter(p =>
        gearFilter.type === 'camera' ? p.cameraId === gearFilter.id : p.filmStockId === gearFilter.id
      )
    }
    if (dayFilter) {
      result = result.filter(p => {
        if (!p.createdAt) return false
        const d = new Date(p.createdAt)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return key === dayFilter
      })
    }
    return result
  }, [basePhotos, gearFilter, dayFilter])

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
                <span className="text-neutral-600 ml-2">· {displayPhotos.length} photo{displayPhotos.length !== 1 ? 's' : ''}</span>
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
          <MasonryGrid photos={displayPhotos} />
        </div>
      )}

      {activeTab === 'stats' && (
        <StatsPanel
          photos={photos}
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

function buildHeatmap(photos: Photo[]) {
  const counts = new Map<string, number>()
  for (const p of photos) {
    if (!p.createdAt) continue
    const d = new Date(p.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
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

// cell = 14px, gap = 4px → 18px per column
const CELL = 14
const GAP = 4
const COL_W = CELL + GAP

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

function ActivityHeatmap({ photos, onDayClick, joinedDate }: {
  photos: Photo[]
  onDayClick?: (date: string, count: number) => void
  joinedDate?: string
}) {
  const { weeks, max, counts } = useMemo(() => buildHeatmap(photos), [photos])
  const monthLabels = useMemo(() => getMonthLabels(weeks), [weeks])

  const yearCount = useMemo(() => {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    return photos.filter(p => p.createdAt && new Date(p.createdAt) > cutoff).length
  }, [photos])

  const totalDaysActive = useMemo(() => counts.size, [counts])

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Upload activity</h3>
          <p className="text-neutral-600 text-xs mt-0.5">
            {yearCount} photo{yearCount !== 1 ? 's' : ''} across {totalDaysActive} day{totalDaysActive !== 1 ? 's' : ''} this year
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-700">Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map(r => (
            <div key={r} style={{ width: CELL, height: CELL, ...heatStyle(r === 0 ? 0 : r, 1) }} />
          ))}
          <span className="text-[10px] text-neutral-700">More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ display: 'inline-block' }}>
          {/* Month labels */}
          <div className="relative mb-1" style={{ height: 16, marginLeft: 36 }}>
            {monthLabels.map(({ label, col, isYear }) => (
              <span
                key={col}
                className={`absolute text-[10px] font-medium ${isYear ? 'text-neutral-400' : 'text-neutral-600'}`}
                style={{ left: col * COL_W }}
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
                  style={{ height: CELL, visibility: i % 2 === 0 ? 'hidden' : 'visible' }}
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
                    const tooltip = isJoinDay
                      ? (count > 0 ? `${formatTooltip(date, count)} · Joined AvoidXray` : 'Joined AvoidXray')
                      : formatTooltip(date, count)
                    return (
                      <button
                        key={date}
                        type="button"
                        title={tooltip}
                        onClick={() => onDayClick?.(date, count)}
                        disabled={count === 0 && !isJoinDay}
                        className={`transition-all hover:ring-2 hover:ring-white hover:ring-offset-1 hover:ring-offset-[#0a0a0a] disabled:cursor-default disabled:hover:ring-0 ${
                          isJoinDay ? 'ring-2 ring-neutral-500 ring-offset-1 ring-offset-[#0a0a0a] cursor-default' : 'cursor-pointer'
                        }`}
                        style={{ width: CELL, height: CELL, ...heatStyle(count, max) }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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
            <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" placeholder={photo.blurHash ? 'blur' : 'empty'} blurDataURL={blurHashToDataURL(photo.blurHash)} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
          <div key={i} className="aspect-square bg-neutral-900" />
        ))}
      </div>
      <div className="p-4 flex items-center gap-4">
        <div className="relative w-32 h-24 flex-shrink-0">
          {displayImage ? (
            <Image src={displayImage} alt="" fill className="object-contain" />
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
            <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" placeholder={photo.blurHash ? 'blur' : 'empty'} blurDataURL={blurHashToDataURL(photo.blurHash)} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
          <div key={i} className="aspect-square bg-neutral-900" />
        ))}
      </div>
      <div className="p-4 flex items-center gap-4">
        <div className="relative w-32 h-24 flex-shrink-0">
          {displayImage ? (
            <Image src={displayImage} alt="" fill className="object-contain" />
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

function StatsPanel({ photos, cameraStats, filmStats, totalLikes, onGearClick, activeGearFilter, onDayClick, joinedDate }: {
  photos: Photo[]
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
          { label: 'Photos', value: photos.length },
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

      <ActivityHeatmap photos={photos} onDayClick={onDayClick} joinedDate={joinedDate} />

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

      {cameraStats.length === 0 && filmStats.length === 0 && photos.length > 0 && (
        <div className="py-12 border border-dashed border-neutral-800 text-center">
          <p className="text-neutral-600 text-sm">Tag photos with cameras and film stocks to see gear stats</p>
        </div>
      )}
    </div>
  )
}
