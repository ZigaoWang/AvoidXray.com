/**
 * A size as people read it: "820 KB", "5.9 MB", "18.4 GB". One decimal from a
 * megabyte up, whole kilobytes below, and empty when the size is not known.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return ''
  if (bytes === 0) return '0 KB'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1024 ** 2
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
