import { prisma } from '@/lib/db'
import type { LibraryUser } from './access'

/**
 * The storage an account gets unless an admin sets its own limit
 * (`User.storageLimitBytes`). Admin accounts have none.
 */
export const DEFAULT_STORAGE_LIMIT_BYTES = BigInt(50) * BigInt(1024) ** BigInt(3)

export interface StorageUsage {
  usedBytes: number
  /** Null when there is no limit. */
  limitBytes: number | null
}

/** The account's limit in bytes, or null for none. */
export function storageLimitOf(user: Pick<LibraryUser, 'isAdmin' | 'storageLimitBytes'>): number | null {
  if (user.isAdmin) return null
  return Number(user.storageLimitBytes ?? DEFAULT_STORAGE_LIMIT_BYTES)
}

/**
 * Bytes stored for the account: every community photo's original and display
 * versions, trashed ones included until they are purged, plus files still on
 * their way in, counted at their declared size.
 */
export async function storageUsage(user: Pick<LibraryUser, 'id' | 'isAdmin' | 'storageLimitBytes'>): Promise<StorageUsage> {
  const [photos, pending] = await Promise.all([
    prisma.photo.aggregate({
      where: { userId: user.id, kind: 'COMMUNITY' },
      _sum: { originalBytes: true, derivativeBytes: true },
    }),
    prisma.importItem.aggregate({
      where: { userId: user.id, state: { in: ['UPLOADING', 'UPLOADED', 'PROCESSING'] } },
      _sum: { bytes: true },
    }),
  ])
  return {
    usedBytes: (photos._sum.originalBytes ?? 0) + (photos._sum.derivativeBytes ?? 0) + (pending._sum.bytes ?? 0),
    limitBytes: storageLimitOf(user),
  }
}
