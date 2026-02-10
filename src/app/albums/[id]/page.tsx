import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Image from 'next/image'
import Link from 'next/link'

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  const album = await prisma.collection.findUnique({
    where: { id },
    include: {
      photos: {
        include: {
          photo: {
            include: {
              user: { select: { username: true, name: true, avatar: true } },
              filmStock: true,
              _count: { select: { likes: true } }
            }
          }
        },
        orderBy: { order: 'asc' }
      },
      user: { select: { id: true, username: true, name: true, avatar: true } },
      _count: { select: { photos: true } }
    }
  })

  if (!album) {
    notFound()
  }

  const isOwner = userId === album.userId

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-black text-white mb-2 tracking-tight">{album.name}</h1>
                {album.description && (
                  <p className="text-neutral-400 mb-3">{album.description}</p>
                )}
                <p className="text-neutral-600 text-sm">{album._count.photos} photos</p>
              </div>
              {isOwner && (
                <div className="flex gap-2">
                  <Link
                    href={`/albums/${album.id}/edit`}
                    className="px-4 py-2 bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 transition-colors"
                  >
                    Edit Album
                  </Link>
                </div>
              )}
            </div>

            {album.user && (
              <Link href={`/${album.user.username}`} className="inline-flex items-center gap-3 group">
                <div className="w-10 h-10 bg-neutral-800 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                  {album.user.avatar ? (
                    <Image src={album.user.avatar} alt="" width={32} height={32} className="w-full h-full object-cover" />
                  ) : (
                    (album.user.name || album.user.username).charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-[#D32F2F] transition-colors">
                    {album.user.name || album.user.username}
                  </p>
                  <p className="text-neutral-500 text-xs">@{album.user.username}</p>
                </div>
              </Link>
            )}
          </div>

          {album.photos.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-neutral-800">
              <p className="text-neutral-500">No photos in this album yet</p>
              {isOwner && (
                <Link
                  href={`/albums/${album.id}/edit`}
                  className="inline-block mt-4 px-5 py-2.5 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors"
                >
                  Add Photos
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {album.photos.map(cp => (
                <Link
                  key={cp.id}
                  href={`/photos/${cp.photo.id}`}
                  className="group aspect-square bg-neutral-900 relative overflow-hidden hover:scale-[1.02] transition-transform"
                >
                  <Image
                    src={cp.photo.thumbnailPath}
                    alt={cp.photo.caption || ''}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      {cp.photo.caption && (
                        <p className="text-white text-xs font-medium line-clamp-2 mb-1">{cp.photo.caption}</p>
                      )}
                      <div className="flex items-center gap-2 text-neutral-300 text-xs">
                        <span>{cp.photo._count.likes} likes</span>
                        {cp.photo.filmStock && (
                          <>
                            <span>•</span>
                            <span>{cp.photo.filmStock.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
