import { prisma } from '@/lib/db'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q = '', type = 'all' } = await searchParams

  if (!q) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-neutral-500">Enter a search term</p>
        </main>
        <Footer />
      </div>
    )
  }

  const query = q.toLowerCase()

  const [photos, users, cameras, films] = await Promise.all([
    type === 'all' || type === 'photos' ? prisma.photo.findMany({
      where: { caption: { contains: query } },
      include: { user: true, filmStock: true, _count: { select: { likes: true } } },
      take: 50
    }) : [],
    type === 'all' || type === 'users' ? prisma.user.findMany({
      where: { OR: [{ username: { contains: query } }, { name: { contains: query } }] },
      include: { _count: { select: { photos: true } } },
      take: 50
    }) : [],
    type === 'all' || type === 'cameras' ? prisma.camera.findMany({
      where: { OR: [{ name: { contains: query } }, { brand: { contains: query } }] },
      include: { _count: { select: { photos: true } } },
      take: 50
    }) : [],
    type === 'all' || type === 'films' ? prisma.filmStock.findMany({
      where: { OR: [{ name: { contains: query } }, { brand: { contains: query } }] },
      include: { _count: { select: { photos: true } } },
      take: 50
    }) : []
  ])

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'photos', label: `Photos (${photos.length})` },
    { id: 'users', label: `Users (${users.length})` },
    { id: 'cameras', label: `Cameras (${cameras.length})` },
    { id: 'films', label: `Films (${films.length})` }
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h1 className="text-2xl font-black text-white mb-2">Search results for "{q}"</h1>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-neutral-800 mb-8">
            {tabs.map(tab => (
              <Link
                key={tab.id}
                href={`/search?q=${encodeURIComponent(q)}&type=${tab.id}`}
                className={`py-3 text-sm font-medium transition-colors ${type === tab.id ? 'text-white border-b-2 border-[#D32F2F]' : 'text-neutral-500 hover:text-white'}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          {/* Photos */}
          {(type === 'all' || type === 'photos') && photos.length > 0 && (
            <section className="mb-10">
              {type === 'all' && <h2 className="text-neutral-500 text-xs uppercase tracking-wider mb-4">Photos</h2>}
              <div className="grid grid-cols-3 md:grid-cols-4 gap-1">
                {photos.map(photo => (
                  <Link key={photo.id} href={`/photos/${photo.id}`} className="relative aspect-square bg-neutral-900 group overflow-hidden">
                    <Image src={photo.thumbnailPath} alt={photo.caption || ''} fill className="object-cover group-hover:opacity-80 transition-opacity" sizes="25vw" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Users */}
          {(type === 'all' || type === 'users') && users.length > 0 && (
            <section className="mb-10">
              {type === 'all' && <h2 className="text-neutral-500 text-xs uppercase tracking-wider mb-4">Users</h2>}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {users.map(user => (
                  <Link key={user.id} href={`/${user.username}`} className="flex items-center gap-4 p-4 bg-neutral-900 hover:bg-neutral-800 transition-colors">
                    <div className="w-12 h-12 bg-neutral-700 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                      {user.avatar ? <Image src={user.avatar} alt="" width={48} height={48} className="w-full h-full object-cover" /> : (user.name || user.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{user.name || user.username}</p>
                      <p className="text-neutral-500 text-sm">@{user.username} · {user._count.photos} photos</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Cameras */}
          {(type === 'all' || type === 'cameras') && cameras.length > 0 && (
            <section className="mb-10">
              {type === 'all' && <h2 className="text-neutral-500 text-xs uppercase tracking-wider mb-4">Cameras</h2>}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {cameras.map(camera => (
                  <Link key={camera.id} href={`/cameras/${camera.id}`} className="p-4 bg-neutral-900 hover:bg-neutral-800 transition-colors">
                    <p className="text-white font-medium">{camera.name}</p>
                    <p className="text-neutral-500 text-sm">{camera._count.photos} photos</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Films */}
          {(type === 'all' || type === 'films') && films.length > 0 && (
            <section className="mb-10">
              {type === 'all' && <h2 className="text-neutral-500 text-xs uppercase tracking-wider mb-4">Films</h2>}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {films.map(film => (
                  <Link key={film.id} href={`/films/${film.id}`} className="p-4 bg-neutral-900 hover:bg-neutral-800 transition-colors">
                    <p className="text-white font-medium">{film.name}</p>
                    <p className="text-neutral-500 text-sm">{film._count.photos} photos</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* No results */}
          {photos.length === 0 && users.length === 0 && cameras.length === 0 && films.length === 0 && (
            <div className="text-center py-20">
              <p className="text-neutral-500">No results found for "{q}"</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
