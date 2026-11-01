'use client'
import StorageUsage from '@/components/StorageUsage'
import { useStorageUsage } from '@/components/StorageUsageLine'
import { eyebrowClass } from '@/components/ui/PageHeader'

/** Storage, for an account with the library; nothing for one without it. */
export default function StorageSection() {
  const usage = useStorageUsage()
  if (!usage) return null
  return (
    <section className="mt-12">
      <h2 className={`${eyebrowClass} mb-6 pb-2 border-b border-neutral-800`}>Storage</h2>
      <StorageUsage usage={usage} />
      <p className="mt-2 text-sm text-neutral-500">
        Originals and their display copies count, and so do photos in the Trash until it is emptied.
      </p>
    </section>
  )
}
