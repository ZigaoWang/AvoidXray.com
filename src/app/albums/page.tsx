import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AlbumGrid from '@/components/AlbumGrid'
import Link from 'next/link'

export default async function MyAlbumsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const userId = (session.user as { id: string }).id

  const albums = await prisma.collection.findMany({
    where: { userId },
    include: {
      photos: {
        include: { photo: true },
        orderBy: { order: 'asc' },
        take: 4
      },
      _count: { select: { photos: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-black text-white mb-2 tracking-tight">My Albums</h1>
              <p className="text-neutral-500">Organize your photos into collections</p>
            </div>
            <Link
              href="/albums/create"
              className="px-5 py-2.5 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors"
            >
              + Create Album
            </Link>
          </div>

          {albums.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-neutral-800">
              <svg className="w-16 h-16 mx-auto mb-4 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-neutral-500 mb-4">No albums yet</p>
              <Link
                href="/albums/create"
                className="inline-block px-5 py-2.5 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors"
              >
                Create Your First Album
              </Link>
            </div>
          ) : (
            <AlbumGrid albums={albums} showEdit={true} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
