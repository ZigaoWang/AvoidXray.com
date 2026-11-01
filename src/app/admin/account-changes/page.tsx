import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin/auth'
import { formatBytes } from '@/lib/formatBytes'
import { DEFAULT_STORAGE_LIMIT_BYTES } from '@/lib/library/storage'
import PageHeader from '@/components/ui/PageHeader'

/**
 * Every change an admin made to an account's storage limit or library beta,
 * newest first: who, for whom, what changed, and when. Read from
 * StorageLimitChange and LibraryBetaChange, written in the same transaction
 * as the change (updateUserAudited in src/lib/admin/repository.ts).
 */

const SHOWN = 200

export default async function AccountChangesPage() {
  await requireAdminPage()
  const [limits, betas] = await Promise.all([
    prisma.storageLimitChange.findMany({ orderBy: { createdAt: 'desc' }, take: SHOWN }),
    prisma.libraryBetaChange.findMany({ orderBy: { createdAt: 'desc' }, take: SHOWN }),
  ])
  const limit = (bytes: bigint | null) => bytes === null ? `Default (${formatBytes(Number(DEFAULT_STORAGE_LIMIT_BYTES))})` : formatBytes(Number(bytes))
  const entries = [
    ...limits.map(e => ({ id: e.id, at: e.createdAt, adminId: e.adminId, userId: e.userId, change: `Storage limit: ${limit(e.oldBytes)} → ${limit(e.newBytes)}` })),
    ...betas.map(e => ({ id: e.id, at: e.createdAt, adminId: e.adminId, userId: e.userId, change: `Library beta: ${e.enabled ? 'on' : 'off'}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, SHOWN)

  const userIds = [...new Set(entries.flatMap(e => [e.adminId, e.userId]))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
  const username = new Map(users.map(u => [u.id, u.username]))
  const account = (id: string) => {
    const name = username.get(id)
    return name ? <Link href={`/${name}`} className="text-white hover:text-brand">@{name}</Link> : <code className="text-neutral-500">{id}</code>
  }

  return (
    <div>
      <PageHeader title="Account changes" description="Every change to an account's storage limit or library beta, made from the Users table." />

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No storage limit or library beta has been changed.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-4 font-medium">When (UTC)</th>
                <th className="py-2 pr-4 font-medium">Admin</th>
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="py-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-neutral-900">
                  <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-neutral-300">
                    {e.at.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-3 pr-4">{account(e.adminId)}</td>
                  <td className="py-3 pr-4">{account(e.userId)}</td>
                  <td className="py-3 tabular-nums text-neutral-300">{e.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
