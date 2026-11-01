'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * The scrolling part of a tab row. On a phone a row such as search's six
 * types or the library's five tabs is wider than the screen, and the last
 * label was simply cut at the edge, which read as a bug rather than as more
 * to scroll to. The current tab is scrolled into view, and an edge fades
 * where there is more beyond it.
 */
export default function TabScroller({ className = '', children }: { className?: string; children: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const el = row.current
    if (!el) return
    const current = el.querySelector<HTMLElement>('[aria-current="page"]')
    if (current && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2
    }
    const measure = () => setEdges({
      start: el.scrollLeft > 1,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    return () => { el.removeEventListener('scroll', measure); resize.disconnect() }
  }, [])

  const fade = edges.start && edges.end
    ? '[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]'
    : edges.end ? '[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]'
      : edges.start ? '[mask-image:linear-gradient(to_right,transparent,black_24px)]' : ''
  return (
    <div ref={row} className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${fade} ${className}`}>
      {children}
    </div>
  )
}
