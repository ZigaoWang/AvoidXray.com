import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AdminActions from './AdminActions'
import BatchPhotoManager from './BatchPhotoManager'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.isAdmin) redirect('/')

  const [users, photos, comments, stats] = await Promise.all([
    prisma.user.findMany({
      include: { _count: { select: { photos: true, comments: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.photo.findMany({
      include: { user: true, _count: { select: { likes: true, comments: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.comment.findMany({
      include: { user: true, photo: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    }),
    Promise.all([
      prisma.user.count(),
      prisma.photo.count(),
      prisma.comment.count(),
      prisma.like.count()
    ])
  ])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-black text-white mb-2">Admin Panel</h1>
          <p className="text-neutral-500 mb-8">Manage users, photos, and content</p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-neutral-900 p-4">
              <div className="text-2xl font-bold text-white">{stats[0]}</div>
              <div className="text-neutral-500 text-sm">Users</div>
            </div>
            <div className="bg-neutral-900 p-4">
              <div className="text-2xl font-bold text-white">{stats[1]}</div>
              <div className="text-neutral-500 text-sm">Photos</div>
            </div>
            <div className="bg-neutral-900 p-4">
              <div className="text-2xl font-bold text-white">{stats[2]}</div>
              <div className="text-neutral-500 text-sm">Comments</div>
            </div>
            <div className="bg-neutral-900 p-4">
              <div className="text-2xl font-bold text-white">{stats[3]}</div>
              <div className="text-neutral-500 text-sm">Likes</div>
            </div>
          </div>

          {/* Users */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-white mb-4">Users</h2>
            <div className="bg-neutral-900 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800">
                    <th className="text-left p-3 text-neutral-500">User</th>
                    <th className="text-left p-3 text-neutral-500">Email</th>
                    <th className="text-left p-3 text-neutral-500">Photos</th>
                    <th className="text-left p-3 text-neutral-500">Joined</th>
                    <th className="text-left p-3 text-neutral-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-neutral-800">
                      <td className="p-3">
                        <Link href={`/${u.username}`} className="flex items-center gap-2 text-white hover:text-[#D32F2F]">
                          {u.avatar ? (
                            <Image src={u.avatar} alt="" width={24} height={24} className="rounded-full" />
                          ) : (
                            <div className="w-6 h-6 bg-neutral-700 rounded-full" />
                          )}
                          @{u.username}
                          {u.isAdmin && <span className="text-xs bg-[#D32F2F] px-1">ADMIN</span>}
                        </Link>
                      </td>
                      <td className="p-3 text-neutral-400">{u.email}</td>
                      <td className="p-3 text-neutral-400">{u._count.photos}</td>
                      <td className="p-3 text-neutral-400">{u.createdAt.toLocaleDateString()}</td>
                      <td className="p-3">
                        <AdminActions type="user" id={u.id} isAdmin={u.isAdmin} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Photos with batch delete */}
          <section className="mb-10">
            <BatchPhotoManager photos={photos.map(p => ({ id: p.id, thumbnailPath: p.thumbnailPath, user: { username: p.user.username } }))} />
          </section>

          {/* Recent Comments */}
          <section>
            <h2 className="text-lg font-bold text-white mb-4">Recent Comments</h2>
            <div className="bg-neutral-900 divide-y divide-neutral-800">
              {comments.map(c => (
                <div key={c.id} className="p-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-neutral-400 text-sm truncate">{c.content}</p>
                    <p className="text-neutral-600 text-xs">
                      by @{c.user.username} on photo {c.photoId.slice(0, 8)}...
                    </p>
                  </div>
                  <AdminActions type="comment" id={c.id} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
