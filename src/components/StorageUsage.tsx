import Link from 'next/link'
import { formatBytes } from '@/lib/formatBytes'
import { STORAGE_WARN_SHARE, type StorageUsage as Usage } from '@/lib/library/storageRules'

/**
 * Storage used against the account's limit: on the uploader, the library and
 * Settings. One quiet line until the account passes STORAGE_WARN_SHARE of its
 * limit, then a bar and what happens at the limit, and at the limit the
 * notice that says nothing stored is touched and how to make room.
 */
export default function StorageUsage({ usage, className = '' }: { usage: Usage; className?: string }) {
  const { usedBytes, limitBytes } = usage
  if (limitBytes === null) {
    return <p className={`text-sm text-neutral-500 ${className}`}>{formatBytes(usedBytes)} stored · No storage limit</p>
  }
  const share = usedBytes / limitBytes
  if (share >= 1) return <StorageFullNotice className={className} />
  if (share < STORAGE_WARN_SHARE) {
    return <p className={`text-sm text-neutral-500 ${className}`}>{formatBytes(usedBytes)} of {formatBytes(limitBytes)} used</p>
  }
  return (
    <div className={`max-w-md ${className}`}>
      <div className="flex justify-between gap-4 text-sm">
        <span className="text-warning-light">{formatBytes(usedBytes)} of {formatBytes(limitBytes)} used</span>
        <span className="text-warning-light">{formatBytes(limitBytes - usedBytes)} left</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-neutral-800" role="meter" aria-label="Storage used"
        aria-valuemin={0} aria-valuemax={limitBytes} aria-valuenow={usedBytes}>
        <div className="h-full bg-warning" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-neutral-400">
        At the limit, new uploads pause. Nothing you have stored is deleted or hidden.
      </p>
    </div>
  )
}

/**
 * What to say when there is no room: for a full account, and for a drop
 * larger than what is left (`needed` and `left`), which is refused before
 * anything uploads so an import never stops halfway.
 */
export function StorageFullNotice({ needed, left, className = '' }: { needed?: number; left?: number; className?: string }) {
  return (
    <div role="status" className={`border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-white ${className}`}>
      <p className="font-bold">
        {needed === undefined
          ? 'Your storage is full, so new uploads are paused'
          : `These files come to ${formatBytes(needed)} and you have ${formatBytes(left ?? 0)} left, so the upload has not started`}
      </p>
      <p className="mt-1 text-neutral-300">
        Your photos are safe. Nothing is deleted or hidden, and published photos stay up. Only new uploads wait until there is room.
      </p>
      <p className="mt-1 text-neutral-300">
        To make room, delete photos you no longer need, then empty the <Link href="/library/trash" className="underline underline-offset-4 hover:text-white">Trash</Link>:
        photos in the Trash still count until it is emptied. Download their originals first if you want to keep a copy.
      </p>
    </div>
  )
}
