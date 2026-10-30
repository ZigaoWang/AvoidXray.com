'use client'

import { useEffect, useState } from 'react'
import type { FilmStockOption } from '@/lib/filmSearch'

export interface CameraOption { id: string; name: string; brand?: string | null; aliases?: string[]; imageUrl?: string | null; defaultFilmStockId?: string | null }
export interface LabOption { id: string; name: string; aliases?: string[]; city?: string | null; country?: string | null }

/** Every film stock, camera and lab, as the pickers show them. */
export interface Catalog {
  films: FilmStockOption[]
  cameras: CameraOption[]
  labs: LabOption[]
}

export type CatalogType = 'camera' | 'film' | 'lab'
/** A catalog entry just added: its id and name, and for a camera the film it usually takes. */
export interface CatalogItem { id: string; name: string; defaultFilmStockId?: string | null }

const LIST_KEY = { film: 'films', camera: 'cameras', lab: 'labs' } as const

/** The catalog with a newly added item in its list. */
export function withCatalogItem(catalog: Catalog, type: CatalogType, item: CatalogItem): Catalog {
  const key = LIST_KEY[type]
  const list: CatalogItem[] = catalog[key]
  return list.some(i => i.id === item.id) ? catalog : { ...catalog, [key]: [...list, item] }
}

/** Loaded once per page visit and shared by every picker on it. */
let catalogPromise: Promise<Catalog> | null = null

/**
 * The catalog, loaded when first needed, and a way to put a newly added item
 * in it. Every picker that asks gets the same lists, so a camera added in one
 * dialog is there in the next.
 */
export function useCatalog(enabled = true): [Catalog | null, (type: CatalogType, item: CatalogItem) => void] {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    if (!enabled) return
    const get = (url: string) => fetch(url).then(r => (r.ok ? r.json() : [])).then(d => (Array.isArray(d) ? d : [])).catch(() => [])
    catalogPromise ??= Promise.all([get('/api/filmstocks'), get('/api/cameras'), get('/api/labs')])
      .then(([films, cameras, labs]) => ({ films, cameras, labs }))
    let live = true
    void catalogPromise.then(c => { if (live) setCatalog(c) })
    return () => { live = false }
  }, [enabled])
  const add = (type: CatalogType, item: CatalogItem) => {
    catalogPromise = catalogPromise?.then(c => withCatalogItem(c, type, item)) ?? null
    setCatalog(c => (c ? withCatalogItem(c, type, item) : c))
  }
  return [catalog, add]
}

/**
 * The fields a newly added item fills: its own, and for a camera the film it
 * usually takes when no film is chosen yet, as on the upload page.
 */
export function fieldsForNewItem(type: CatalogType, item: CatalogItem, current: { filmStockId?: string | null }): Record<string, string> {
  if (type === 'film') return { filmStockId: item.id }
  if (type === 'lab') return { labId: item.id }
  return !current.filmStockId && item.defaultFilmStockId
    ? { cameraId: item.id, filmStockId: item.defaultFilmStockId }
    : { cameraId: item.id }
}
