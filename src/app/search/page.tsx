import { prisma } from '@/lib/db'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; film?: string; camera?: string; sort?: string }> }) {
  const { q = '', type = 'all', film, camera, sort = 'recent' } = await searchParams

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

  const query = q.toLowerCase().trim()

  // Check if searching for a tag
  const isTagSearch = query.startsWith('#')
  const tagName = isTagSearch ? query.slice(1) : null

  let photos: any[] = []
  let users: any[] = []
  let cameras: any[] = []
  let films: any[] = []
  let tags: any[] = []

  if (isTagSearch && tagName) {
    // Tag search
    const tag = await prisma.tag.findUnique({
      where: { name: tagName },
      include: {
        photos: {
          include: {
            photo: {
              include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } }
            }
          },
          where: { photo: { published: true } }
        }
      }
    })
    if (tag) {
      photos = tag.photos.map(pt => pt.photo)
    }
  } else {
    // Regular search with case-insensitive contains using mode: 'insensitive'
    const photoWhere: any = { published: true, caption: { contains: query, mode: 'insensitive' } }
    if (film) photoWhere.filmStockId = film
    if (camera) photoWhere.cameraId = camera

    const photoOrderBy: any = sort === 'popular'
      ? { likes: { _count: 'desc' } }
      : { createdAt: 'desc' }

    ;[photos, users, cameras, films, tags] = await Promise.all([
      type === 'all' || type === 'photos' ? prisma.photo.findMany({
        where: photoWhere,
        include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } },
        orderBy: photoOrderBy,
        take: 50
      }) : [],
      type === 'all' || type === 'users' ? prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: { _count: { select: { photos: true } } },
        take: 50
      }) : [],
      type === 'all' || type === 'cameras' ? prisma.camera.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { brand: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: {
          photos: { take: 4, orderBy: { createdAt: 'desc' } },
          _count: { select: { photos: true } }
        },
        orderBy: { name: 'asc' },
        take: 50
      }) : [],
      type === 'all' || type === 'films' ? prisma.filmStock.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { brand: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: {
          photos: { take: 4, orderBy: { createdAt: 'desc' } },
          _count: { select: { photos: true } }
        },
        orderBy: { name: 'asc' },
        take: 50
      }) : [],
      type === 'all' || type === 'tags' ? prisma.tag.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        include: { _count: { select: { photos: true } } },
        take: 20
      }) : []
    ])
  }

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'photos', label: `Photos (${photos.length})` },
    { id: 'users', label: `Users (${users.length})` },
    { id: 'tags', label: `Tags (${tags.length})` },
    { id: 'cameras', label: `Cameras (${cameras.length})` },
    { id: 'films', label: `Films (${films.length})` }
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">Search Results</h1>
        <p className="text-neutral-500 mb-8">Results for "{q}"</p>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-neutral-800 mb-8 overflow-x-auto">
          {tabs.map(tab => (
            <Link
              key={tab.id}
              href={`/search?q=${encodeURIComponent(q)}&type=${tab.id}`}
              className={`py-3 text-sm font-medium transition-colors whitespace-nowrap ${type === tab.id ? 'text-white border-b-2 border-[#D32F2F]' : 'text-neutral-500 hover:text-white'}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Photos */}
        {(type === 'all' || type === 'photos') && photos.length > 0 && (
          <section className="mb-10">
            {type === 'all' && <h2 className="text-xl font-bold text-white mb-6">Photos</h2>}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
              {photos.map(photo => (
                <Link key={photo.id} href={`/photos/${photo.id}`} className="relative aspect-[3/2] bg-neutral-900 group overflow-hidden">
                  <Image src={photo.thumbnailPath} alt={photo.caption || ''} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Users */}
        {(type === 'all' || type === 'users') && users.length > 0 && (
          <section className="mb-10">
            {type === 'all' && <h2 className="text-xl font-bold text-white mb-6">Users</h2>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map(user => (
                <Link key={user.id} href={`/${user.username}`} className="flex items-center gap-4 p-4 bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors">
                  <div className="w-12 h-12 bg-neutral-800 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                    {user.avatar ? <Image src={user.avatar} alt="" width={48} height={48} className="w-full h-full object-cover" /> : (user.name || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{user.name || user.username}</p>
                    <p className="text-neutral-500 text-sm">@{user.username} · {user._count.photos} photos</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Tags */}
        {(type === 'all' || type === 'tags') && tags.length > 0 && (
          <section className="mb-10">
            {type === 'all' && <h2 className="text-xl font-bold text-white mb-6">Tags</h2>}
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Link key={tag.id} href={`/tags/${tag.name}`} className="px-4 py-2 bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors text-white">
                  #{tag.name} <span className="text-neutral-500">({tag._count.photos})</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Cameras */}
        {(type === 'all' || type === 'cameras') && cameras.length > 0 && (
          <section className="mb-10">
            {type === 'all' && <h2 className="text-xl font-bold text-white mb-6">Cameras</h2>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cameras.map(camera => {
                const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
                return (
                  <Link
                    key={camera.id}
                    href={`/cameras/${camera.id}`}
                    className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden"
                  >
                    {/* Photo Grid */}
                    <div className="grid grid-cols-4 gap-px bg-neutral-800">
                      {camera.photos.slice(0, 4).map((photo: any) => (
                        <div key={photo.id} className="aspect-square relative bg-neutral-900">
                          <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, 4 - camera.photos.length) }).map((_, i) => (
                        <div key={i} className="aspect-square bg-neutral-900" />
                      ))}
                    </div>

                    {/* Info Section */}
                    <div className="p-4 flex items-center gap-4">
                      <div className="relative w-32 h-24 flex-shrink-0">
                        {displayImage ? (
                          <Image
                            src={displayImage}
                            alt=""
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-800 rounded">
                            <svg
                              className="w-12 h-12 text-neutral-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                          {camera.brand ? `${camera.brand} ${camera.name}` : camera.name}
                        </h3>
                        <p className="text-neutral-500">{camera._count.photos} photos</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Films */}
        {(type === 'all' || type === 'films') && films.length > 0 && (
          <section className="mb-10">
            {type === 'all' && <h2 className="text-xl font-bold text-white mb-6">Films</h2>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {films.map(film => {
                const displayImage = film.imageStatus === 'approved' ? film.imageUrl : null
                return (
                  <Link
                    key={film.id}
                    href={`/films/${film.id}`}
                    className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden"
                  >
                    {/* Photo Grid */}
                    <div className="grid grid-cols-4 gap-px bg-neutral-800">
                      {film.photos.slice(0, 4).map((photo: any) => (
                        <div key={photo.id} className="aspect-square relative bg-neutral-900">
                          <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, 4 - film.photos.length) }).map((_, i) => (
                        <div key={i} className="aspect-square bg-neutral-900" />
                      ))}
                    </div>

                    {/* Info Section */}
                    <div className="p-4 flex items-center gap-4">
                      <div className="relative w-32 h-24 flex-shrink-0">
                        {displayImage ? (
                          <Image
                            src={displayImage}
                            alt=""
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-800 rounded">
                            <svg
                              className="w-12 h-12 text-neutral-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                          {film.brand ? `${film.brand} ${film.name}` : film.name}
                        </h3>
                        <div className="flex items-center gap-2 text-neutral-500">
                          {film.iso && <span>ISO {film.iso}</span>}
                          {film.iso && <span>•</span>}
                          <span>{film._count.photos} photos</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* No results */}
        {photos.length === 0 && users.length === 0 && cameras.length === 0 && films.length === 0 && tags.length === 0 && (
          <div className="text-center py-20 border border-dashed border-neutral-800 rounded">
            <svg className="w-16 h-16 text-neutral-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-neutral-500 text-lg mb-2">No results found</p>
            <p className="text-neutral-600 text-sm">Try a different search term</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
