import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin/auth'
import ScreenedPhoto from './ScreenedPhoto'

/**
 * Photos the automatic nudity check held, and the ones an admin kept hidden.
 *
 * Also says how many uploads are still waiting for the check. Those are
 * invisible to everyone but their owners, so a queue that is not moving means
 * the vision worker is down and new photos are not appearing.
 */

/** Waiting longer than this means the worker is not keeping up, or not running. */
const STALE_MINUTES = 10

export default async function ScreeningPage() {
  await requireAdminPage()
  const select = {
    id: true, thumbnailPath: true, nudityScore: true, screening: true, createdAt: true,
    user: { select: { username: true } },
  } as const
  const [held, rejected, pending, oldestPending] = await Promise.all([
    // Published only. A draft sent for review and then abandoned is deleted
    // by the cleanup job within the hour; deciding it would be wasted work.
    prisma.photo.findMany({ where: { screening: 'HELD', published: true }, orderBy: { createdAt: 'asc' }, take: 100, select }),
    prisma.photo.findMany({ where: { screening: 'REJECTED', published: true }, orderBy: { updatedAt: 'desc' }, take: 50, select }),
    prisma.photo.count({ where: { screening: 'PENDING', published: true } }),
    prisma.photo.findFirst({ where: { screening: 'PENDING', published: true }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])
  // Rendered per request; the clock read is the point.
  // eslint-disable-next-line react-hooks/purity
  const waitedMinutes = oldestPending ? Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 60_000) : 0

  const toCard = (p: (typeof held)[number]) => ({
    id: p.id,
    thumbnailPath: p.thumbnailPath,
    nudityScore: p.nudityScore,
    screening: p.screening as 'HELD' | 'REJECTED',
    // Archive photos are never screened; the fallback only satisfies the type.
    username: p.user?.username ?? 'archive',
    createdAt: p.createdAt.toISOString(),
  })

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">Held photos</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Photos the nudity check flagged after they were stored: uploads made while the check was down, and older photos a newer model flags. New uploads it flags are refused and never stored. Only owners and admins can see these until you decide.
        </p>
      </header>

      <p className={`mb-8 text-sm ${waitedMinutes >= STALE_MINUTES ? 'text-brand' : 'text-neutral-400'}`}>
        {pending === 0
          ? 'No uploads waiting for the check.'
          : `${pending} ${pending === 1 ? 'upload is' : 'uploads are'} waiting for the check, the oldest for ${waitedMinutes} ${waitedMinutes === 1 ? 'minute' : 'minutes'}.`}
        {waitedMinutes >= STALE_MINUTES && ' The vision worker may be down: check pm2 for avoidxray-vision.'}
      </p>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-white mb-4">Waiting for a decision ({held.length})</h2>
        {held.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing is held.</p>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {held.map(p => <ScreenedPhoto key={p.id} photo={toCard(p)} />)}
          </ul>
        )}
      </section>

      {rejected.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-white mb-4">Kept hidden</h2>
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {rejected.map(p => <ScreenedPhoto key={p.id} photo={toCard(p)} />)}
          </ul>
        </section>
      )}
    </div>
  )
}
