/**
 * Storage shapes and thresholds the browser needs too, apart from
 * storage.ts, which reads the database.
 */

export interface StorageUsage {
  usedBytes: number
  /** Null when there is no limit. */
  limitBytes: number | null
}

/** Past this share of the limit, the usage line becomes a warning. */
export const STORAGE_WARN_SHARE = 0.8
