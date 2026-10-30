'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Selection in the library. It lasts across pages, rolls, views and filter
 * changes, as on Your photos: a photo stays selected until it is clicked
 * again, or Clear or Escape empties the selection. Shift-click takes the run
 * from the last photo clicked, in the order shown. `order` is every photo id
 * on screen, in that order.
 */
export function useSelection(order: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)

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

  /** Drops ids that no longer exist, such as photos just moved to the Trash. */
  const remove = useCallback((ids: string[]) => {
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  const clear = useCallback(() => { setSelected(new Set()); anchor.current = null }, [])

  return { selected, toggle, extendTo, add, remove, clear }
}

/**
 * A box dragged across the grid on desktop selects every tile it touches.
 * Starts only on the grid's background, not on a tile, so a click on a photo
 * still selects it. Tiles are found by `data-photo-id`.
 */
export function useDragSelect(container: React.RefObject<HTMLElement | null>, onSelect: (ids: string[], additive: boolean) => void) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    const root = container.current
    if (!root) return
    let start: { x: number; y: number; additive: boolean } | null = null

    const down = (event: MouseEvent) => {
      // A touch scrolls; it never produces the mouse moves that draw a box.
      if (event.button !== 0 || (event.target as HTMLElement).closest('[data-photo-id], button, a, input, select, textarea')) return
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
