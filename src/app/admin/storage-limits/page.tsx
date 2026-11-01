import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin/auth'
import { formatBytes } from '@/lib/formatBytes'
import { DEFAULT_STORAGE_LIMIT_BYTES } from '@/lib/library/storage'
import PageHeader from '@/components/ui/PageHeader'

/**
 * Every change an admin made to an account's storage limit, newest first:
 * who, for whom, from what to what, and when. Read from StorageLimitChange,
 * written in the same transaction as the change (src/lib/admin/repository.ts).
 */

const SHOWN = 200

export default async function StorageLimitsPage() {
  await requireAdminPage()
  const entries = await prisma.storageLimitChange.findMany({ orderBy: { createdAt: 'desc' }, take: SHOWN })
  const userIds = [...new Set(entries.flatMap(e => [e.adminId, e.userId]))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
  const username = new Map(users.map(u => [u.id, u.username]))

  const account = (id: string) => {
    const name = username.get(id)
    return name ? <Link href={`/${name}`} className="text-white hover:text-brand">@{name}</Link> : <code className="text-neutral-500">{id}</code>
  }
  const limit = (bytes: bigint | null) => bytes === null
    ? <span className="text-neutral-500">Default ({formatBytes(Number(DEFAULT_STORAGE_LIMIT_BYTES))})</span>
    : formatBytes(Number(bytes))

  return (
    <div>
      <PageHeader title="Storage limits" description="Every change to an account's storage limit, set from the Users table." />

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No storage limit has been changed.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-4 font-medium">When (UTC)</th>
                <th className="py-2 pr-4 font-medium">Admin</th>
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="py-2 pr-4 font-medium">From</th>
                <th className="py-2 font-medium">To</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-neutral-900">
                  <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-neutral-300">
                    {e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-3 pr-4">{account(e.adminId)}</td>
                  <td className="py-3 pr-4">{account(e.userId)}</td>
                  <td className="py-3 pr-4 tabular-nums">{limit(e.oldBytes)}</td>
                  <td className="py-3 tabular-nums">{limit(e.newBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
