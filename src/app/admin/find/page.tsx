import Image from 'next/image'
import { requireAdminPage } from '@/lib/admin/auth'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatDate } from '@/lib/formatDate'
import { textLinkClass } from '@/components/ui/TextLink'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'

/** Name matches shown per kind. An id or exact name is always shown first. */
const PER_KIND = 5

/**
 * The record a pasted value names, whatever kind it is.
 *
 * Takes an id, a username, a slug, part of a name, or a whole URL from the site,
 * so an id from a report, a log or a user's message is one paste away from its
 * record instead of a database query.
 */
function tokenOf(raw: string): string {
  const value = raw.trim()
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    // /photos/<id>, /albums/<id>, /cameras/<slug>, /films/<slug>, /<username>
    return decodeURIComponent(parts.length > 1 ? parts[1] : parts[0] ?? '')
  } catch {
    return value.replace(/^@/, '')
  }
}

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const })

export default async function AdminFind({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage()
  const { q: raw = '' } = await searchParams
  const q = tokenOf(raw)

  if (!q) {
    return (
      <div>
        <Heading />
      </div>
    )
  }

  const lower = q.toLowerCase()
  const [photos, users, albums, cameras, films, comments, reports] = await Promise.all([
    prisma.photo.findMany({
      where: { OR: [{ id: q }, { caption: contains(q) }] },
      take: PER_KIND,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, thumbnailPath: true, caption: true, published: true, visibility: true, createdAt: true,
        user: { select: { username: true } },
      },
    }),
    prisma.user.findMany({
      where: { OR: [{ id: q }, { username: lower }, { username: contains(q) }, { name: contains(q) }, { email: contains(q) }] },
      take: PER_KIND,
      select: { id: true, username: true, name: true, avatar: true, email: true, isAdmin: true, _count: { select: { photos: true } } },
    }),
    prisma.collection.findMany({
      where: { OR: [{ id: q }, { name: contains(q) }] },
      take: PER_KIND,
      select: { id: true, name: true, public: true, user: { select: { username: true } } },
    }),
    prisma.camera.findMany({
      where: { OR: [{ id: q }, { slug: lower }, { name: contains(q) }] },
      take: PER_KIND,
      select: { id: true, name: true, slug: true, imageUrl: true },
    }),
    prisma.filmStock.findMany({
      where: { OR: [{ id: q }, { slug: lower }, { name: contains(q) }] },
      take: PER_KIND,
      select: { id: true, name: true, slug: true, imageUrl: true },
    }),
    prisma.comment.findMany({
      where: { id: q },
      select: { id: true, content: true, photoId: true, user: { select: { username: true } } },
    }),
    prisma.report.findMany({
      where: { id: q },
      select: { id: true, targetType: true, reason: true, status: true },
    }),
  ])

  const total = photos.length + users.length + albums.length + cameras.length + films.length + comments.length + reports.length

  return (
    <div>
      <Heading />

      {total === 0 ? (
        <div>
          <EmptyState size="compact" message={`Nothing matches “${q}”`} hint="Try an id, a username, a slug or part of a name." />
        </div>
      ) : (
        <div className="space-y-6">
          <Group title="Photos" items={photos.map(p => ({
            key: p.id,
            thumb: <Image src={p.thumbnailPath} alt="" width={40} height={40} className="h-10 w-10 object-cover" />,
            title: p.caption || 'Untitled photo',
            meta: [
              `@${p.user.username}`,
              formatDate(p.createdAt),
              !p.published && 'Unpublished',
              p.visibility === 'PRIVATE' && 'Private',
            ],
            view: `/photos/${p.id}`,
            admin: `/admin/photos?q=${p.id}`,
          }))} />
          <Group title="Users" items={users.map(u => ({
            key: u.id,
            thumb: <Avatar src={u.avatar} name={u.name || u.username} size={40} />,
            title: u.name ? `${u.name} (@${u.username})` : `@${u.username}`,
            meta: [u.email, `${u._count.photos.toLocaleString('en-US')} photos`, u.isAdmin && 'Admin'],
            view: `/${u.username}`,
            admin: `/admin/users?q=${u.id}`,
          }))} />
          <Group title="Albums" items={albums.map(a => ({
            key: a.id,
            title: a.name,
            meta: [a.user && `@${a.user.username}`, !a.public && 'Private'],
            view: `/albums/${a.id}`,
            admin: `/admin/albums?q=${a.id}`,
          }))} />
          <Group title="Cameras" items={cameras.map(c => ({
            key: c.id,
            thumb: c.imageUrl ? <Image src={c.imageUrl} alt="" width={40} height={40} className="h-10 w-10 object-contain" /> : undefined,
            title: c.name,
            meta: [c.slug],
            view: c.slug ? `/cameras/${c.slug}` : undefined,
            admin: `/admin/cameras?q=${c.id}`,
          }))} />
          <Group title="Film stocks" items={films.map(f => ({
            key: f.id,
            thumb: f.imageUrl ? <Image src={f.imageUrl} alt="" width={40} height={40} className="h-10 w-10 object-contain" /> : undefined,
            title: f.name,
            meta: [f.slug],
            view: f.slug ? `/films/${f.slug}` : undefined,
            admin: `/admin/films?q=${f.id}`,
          }))} />
          <Group title="Comments" items={comments.map(c => ({
            key: c.id,
            title: c.content.slice(0, 120),
            meta: [`@${c.user.username}`],
            view: `/photos/${c.photoId}#comment-${c.id}`,
            admin: `/admin/comments?q=${c.id}`,
          }))} />
          <Group title="Reports" items={reports.map(r => ({
            key: r.id,
            title: `Report on a ${r.targetType}`,
            meta: [r.reason.toLowerCase().replace(/_/g, ' '), r.status.toLowerCase()],
            admin: `/admin/reports?q=${r.id}`,
          }))} />
        </div>
      )}
    </div>
  )
}

function Heading() {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-black tracking-tight text-white">Find</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paste an id, a link, a username or part of a name into the box above.
      </p>
    </header>
  )
}

interface Item {
  key: string
  thumb?: React.ReactNode
  title: string
  meta: (string | false | null | undefined)[]
  view?: string
  admin: string
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{title}</h2>
      <ul className="divide-y divide-neutral-800 border border-neutral-800">
        {items.map(item => (
          <li key={item.key} className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-neutral-900">{item.thumb}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{item.title}</p>
              <p className="truncate text-xs text-neutral-500">
                {item.meta.filter(Boolean).join(' · ')}
                <span className="ml-2 font-mono text-neutral-600">{item.key}</span>
              </p>
            </div>
            <div className="flex shrink-0 gap-3 text-xs">
              {item.view && <Link href={item.view} target="_blank" className={textLinkClass}>View</Link>}
              <Link href={item.admin} className={textLinkClass}>Edit</Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
