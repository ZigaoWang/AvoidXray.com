import Link from 'next/link'
import { prisma } from '@/lib/db'

/**
 * Overview.
 *
 * Counts only. This page used to load every user, every published photo with
 * four joins each, and every camera and film stock, then serialise the lot into
 * the HTML — around a thousand fully-hydrated photo records on one request,
 * growing with the site. Each section now pages its own data.
 */
export default async function AdminOverview() {
  const [
    users, photos, published, unpublished, privatePhotos,
    comments, likes, cameras, films, albums, notes,
    openReports, pendingCameras, pendingFilms, recentPhotos, recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.photo.count(),
    prisma.photo.count({ where: { published: true } }),
    prisma.photo.count({ where: { published: false } }),
    prisma.photo.count({ where: { visibility: 'PRIVATE' } }),
    prisma.comment.count(),
    prisma.like.count(),
    prisma.camera.count(),
    prisma.filmStock.count(),
    prisma.collection.count(),
    prisma.communityNote.count(),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.moderationSubmission.count({ where: { status: 'pending', resourceType: 'camera' } }),
    prisma.moderationSubmission.count({ where: { status: 'pending', resourceType: 'filmstock' } }),
    prisma.photo.count({ where: { createdAt: { gte: sevenDaysAgo() } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo() } } }),
  ])

  const pending = pendingCameras + pendingFilms

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">Overview</h1>
        <p className="text-neutral-500 text-sm mt-1">Everything on the site at a glance.</p>
      </header>

      {openReports > 0 && (
        <Link
          href="/admin/reports"
          className="flex items-center justify-between gap-4 mb-3 px-4 py-3 border border-[#D32F2F]/40 bg-[#D32F2F]/10
                     hover:bg-[#D32F2F]/20 transition-colors"
        >
          <span className="text-sm text-white">
            {openReports} open report{openReports === 1 ? '' : 's'}
          </span>
          <span className="text-xs uppercase tracking-wide text-[#ff8a80]">Review →</span>
        </Link>
      )}

      {pending > 0 && (
        <Link
          href="/admin/moderation"
          className="flex items-center justify-between gap-4 mb-6 px-4 py-3 border border-[#D32F2F]/40 bg-[#D32F2F]/10
                     hover:bg-[#D32F2F]/20 transition-colors"
        >
          <span className="text-sm text-white">
            {pending} submission{pending === 1 ? '' : 's'} waiting for review
          </span>
          <span className="text-xs uppercase tracking-wide text-[#ff8a80]">Review →</span>
        </Link>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Photos" value={photos} href="/admin/photos" note={`${published.toLocaleString()} published`} />
        <Stat label="Users" value={users} href="/admin/users" note={`+${recentUsers} this week`} />
        <Stat label="Comments" value={comments} href="/admin/comments" />
        <Stat label="Likes" value={likes} />
        <Stat label="Cameras" value={cameras} href="/admin/cameras" />
        <Stat label="Film stocks" value={films} href="/admin/films" />
        <Stat label="Albums" value={albums} href="/admin/albums" />
        <Stat label="Community notes" value={notes} href="/admin/notes" />
        <Stat label="Open reports" value={openReports} href="/admin/reports" />
      </section>

      <section className="grid gap-3 sm:grid-cols-3 mb-8">
        <Panel
          title="Unpublished drafts"
          value={unpublished}
          href="/admin/photos"
          detail="Deleted automatically an hour after upload."
        />
        <Panel title="Private photos" value={privatePhotos} href="/admin/photos" detail="Visible only to their owner." />
        <Panel title="Uploads this week" value={recentPhotos} detail="Last seven days." />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Operations</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard
            href="/admin/moderation"
            title="Moderation queue"
            body="Community edits to cameras and film stocks awaiting review."
          />
          <ActionCard
            href="/admin/maintenance"
            title="Maintenance"
            body="Storage sync, orphan cleanup and draft removal."
          />
        </div>
      </section>
    </div>
  )
}

function sevenDaysAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
}

function Stat({ label, value, href, note }: { label: string; value: number; href?: string; note?: string }) {
  const body = (
    <>
      <div className="text-2xl font-black text-white tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-neutral-500 mt-0.5">{label}</div>
      {note && <div className="text-[11px] text-neutral-600 mt-1">{note}</div>}
    </>
  )
  const className = 'bg-neutral-900 border border-neutral-800 p-4 block transition-colors'
  return href
    ? <Link href={href} className={`${className} hover:border-neutral-600`}>{body}</Link>
    : <div className={className}>{body}</div>
}

function Panel({ title, value, href, detail }: { title: string; value: number; href?: string; detail: string }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-neutral-300">{title}</span>
        <span className="text-xl font-bold text-white tabular-nums">{value.toLocaleString()}</span>
      </div>
      <p className="text-[11px] text-neutral-600 mt-1">{detail}</p>
    </>
  )
  const className = 'border border-neutral-800 p-4 block transition-colors'
  return href
    ? <Link href={href} className={`${className} hover:border-neutral-600`}>{body}</Link>
    : <div className={className}>{body}</div>
}

function ActionCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="border border-neutral-800 p-4 hover:border-neutral-600 transition-colors block">
      <div className="text-sm text-white font-medium">{title}</div>
      <p className="text-xs text-neutral-500 mt-1">{body}</p>
    </Link>
  )
}
