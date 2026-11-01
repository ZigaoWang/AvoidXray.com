'use client'
import { useEffect, useState } from 'react'
import StorageUsage from './StorageUsage'
import type { StorageUsage as Usage } from '@/lib/library/storageRules'

const fetchUsage = (): Promise<Usage | null> =>
  fetch('/api/library/storage').then(r => (r.ok ? r.json() : null)).catch(() => null)

/**
 * The account's storage, read for the library and Settings. Nothing at all
 * for an account without the library, whose request answers 404, or while it
 * loads: a quiet line is not worth a placeholder.
 */
export default function StorageUsageLine({ className = '' }: { className?: string }) {
  const usage = useStorageUsage()
  return usage ? <StorageUsage usage={usage} className={className} /> : null
}

/** The account's storage, or null while it loads or without the library. */
export function useStorageUsage(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    let live = true
    void fetchUsage().then(u => { if (live) setUsage(u) })
    return () => { live = false }
  }, [])
  return usage
}
