'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Selection in the library: click to toggle once anything is selected,
 * shift-click for a range in display order, drag a box on desktop, long press
 * on a phone. `order` is every photo id on the page, in the order shown.
 */
export function useSelection(order: string[]) {
  const [chosen, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)

  // Ids that leave the page leave the selection.
  const selected = useMemo(() => {
    const present = new Set(order)
    const kept = [...chosen].filter(id => present.has(id))
    return kept.length === chosen.size ? chosen : new Set(kept)
  }, [chosen, order])

  const toggle = useCallback((id: string) => {
    anchor.current = id
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** From the last photo clicked to this one, added to the selection. */
  const extendTo = useCallback((id: string) => {
    const from = anchor.current ? order.indexOf(anchor.current) : -1
    const to = order.indexOf(id)
    if (from < 0 || to < 0) { toggle(id); return }
    const [a, b] = from < to ? [from, to] : [to, from]
    setSelected(prev => new Set([...prev, ...order.slice(a, b + 1)]))
  }, [order, toggle])

  const add = useCallback((ids: string[], replace = false) => {
    setSelected(prev => new Set(replace ? ids : [...prev, ...ids]))
  }, [])

  const clear = useCallback(() => { setSelected(new Set()); anchor.current = null }, [])

  return { selected, toggle, extendTo, add, clear }
}

/**
 * A box dragged across the grid on desktop selects every tile it touches.
 * Starts only on the grid's background, not on a tile, so a click on a photo
 * still opens it. Tiles are found by `data-photo-id`.
 */
export function useDragSelect(container: React.RefObject<HTMLElement | null>, onSelect: (ids: string[], additive: boolean) => void) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    const root = container.current
    if (!root) return
    let start: { x: number; y: number; additive: boolean } | null = null

    const down = (event: MouseEvent) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('[data-photo-id], button, a, input, select, textarea')) return
      if (!window.matchMedia('(pointer: fine)').matches) return
      start = { x: event.clientX, y: event.clientY, additive: event.shiftKey || event.metaKey || event.ctrlKey }
    }
    const move = (event: MouseEvent) => {
      if (!start) return
      const x = Math.min(start.x, event.clientX)
      const y = Math.min(start.y, event.clientY)
      const w = Math.abs(event.clientX - start.x)
      const h = Math.abs(event.clientY - start.y)
      if (w < 6 && h < 6) return
      event.preventDefault()
      setBox({ x, y, w, h })
    }
    const up = (event: MouseEvent) => {
      if (!start) return
      const x1 = Math.min(start.x, event.clientX), x2 = Math.max(start.x, event.clientX)
      const y1 = Math.min(start.y, event.clientY), y2 = Math.max(start.y, event.clientY)
      const additive = start.additive
      start = null
      setBox(null)
      if (x2 - x1 < 6 && y2 - y1 < 6) return
      const hit: string[] = []
      for (const tile of root.querySelectorAll<HTMLElement>('[data-photo-id]')) {
        const r = tile.getBoundingClientRect()
        if (r.right >= x1 && r.left <= x2 && r.bottom >= y1 && r.top <= y2) hit.push(tile.dataset.photoId!)
      }
      onSelect(hit, additive)
    }
    root.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      root.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [container, onSelect])

  return box
}

/** Long press on touch: calls `onLongPress` after holding still for a moment. */
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  return {
    onTouchStart: () => {
      fired.current = false
      cancel()
      timer.current = setTimeout(() => { fired.current = true; onLongPress() }, ms)
    },
    onTouchMove: cancel,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    /** True right after a long press, so the click that follows it is ignored. */
    consumed: () => { const was = fired.current; fired.current = false; return was },
  }
}
