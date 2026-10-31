import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin/auth'

/**
 * Every upload an admin made into another account's library, newest first:
 * who, for whom, when, and the rolls and photos it made. Read from
 * AdminUploadAudit, which keeps the ids after the photos or accounts are gone,
 * so a name that no longer resolves shows as its id.
 */

const SHOWN = 200

export default async function UploadsForAccountsPage() {
  await requireAdminPage()
  const entries = await prisma.adminUploadAudit.findMany({ orderBy: { createdAt: 'desc' }, take: SHOWN })

  const userIds = [...new Set(entries.flatMap(e => [e.adminId, e.targetUserId]))]
  const rollIds = [...new Set(entries.flatMap(e => e.rollIds))]
  const [users, rolls] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } }),
    prisma.roll.findMany({ where: { id: { in: rollIds } }, select: { id: true, title: true } }),
  ])
  const username = new Map(users.map(u => [u.id, u.username]))
  const rollName = new Map(rolls.map(r => [r.id, r.title || 'Untitled roll']))

  const account = (id: string) => {
    const name = username.get(id)
    return name ? <Link href={`/${name}`} className="text-white hover:text-brand">@{name}</Link> : <code className="text-neutral-500">{id}</code>
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">Uploads for accounts</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Uploads an admin made into someone else&apos;s library from <code>/upload?asUserId=</code>, one entry per upload. Photos are added as they finish processing.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No admin has uploaded for another account.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-4 font-medium">When (UTC)</th>
                <th className="py-2 pr-4 font-medium">Admin</th>
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="py-2 pr-4 font-medium">Rolls</th>
                <th className="py-2 font-medium">Photos</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-neutral-900 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-neutral-300">
                    {e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-3 pr-4">{account(e.adminId)}</td>
                  <td className="py-3 pr-4">{account(e.targetUserId)}</td>
                  <td className="py-3 pr-4">
                    {e.rollIds.length === 0 ? (
                      <span className="text-neutral-600">None</span>
                    ) : (
                      <ul className="space-y-1">
                        {e.rollIds.map(id => (
                          <li key={id}>
                            {rollName.get(id) ?? 'Deleted roll'} <code className="text-[11px] text-neutral-500">{id}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-3">
                    {e.photoIds.length === 0 ? (
                      <span className="text-neutral-600">None yet</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-neutral-300">
                          {e.photoIds.length} {e.photoIds.length === 1 ? 'photo' : 'photos'}
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {e.photoIds.map(id => (
                            <li key={id}>
                              <Link href={`/photos/${id}`} className="font-mono text-[11px] text-neutral-400 hover:text-brand">{id}</Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === SHOWN && <p className="mt-4 text-xs text-neutral-500">The newest {SHOWN} are shown.</p>}
        </div>
      )}
    </div>
  )
}
