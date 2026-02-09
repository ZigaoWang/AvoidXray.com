'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Album = {
  id: string
  name: string
  description: string | null
  _count: { photos: number }
  photos: Array<{ photo: { thumbnailPath: string } }>
}

export default function AlbumGrid({ albums: initialAlbums, showEdit = false }: { albums: Album[], showEdit?: boolean }) {
  const [albums, setAlbums] = useState(initialAlbums)
  const router = useRouter()

  const handleDelete = async (albumId: string, albumName: string) => {
    if (!confirm(`Are you sure you want to delete the album "${albumName}"? Photos will not be deleted.`)) {
      return
    }

    const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' })
    if (res.ok) {
      setAlbums(albums.filter(a => a.id !== albumId))
    } else {
      alert('Failed to delete album')
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {albums.map(album => (
        <div key={album.id} className="group bg-neutral-900 overflow-hidden hover:bg-neutral-800 transition-colors relative">
          <Link href={`/albums/${album.id}`}>
            <div className="grid grid-cols-4 gap-0.5">
              {album.photos.slice(0, 4).map((cp, i) => (
                <div key={i} className="aspect-square relative">
                  <Image
                    src={cp.photo.thumbnailPath}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="12vw"
                  />
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - album.photos.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square bg-neutral-800 flex items-center justify-center">
                  <svg className="w-8 h-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              ))}
            </div>
          </Link>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/albums/${album.id}`} className="flex-1">
                <h2 className="text-white font-bold text-lg group-hover:text-[#D32F2F] transition-colors">
                  {album.name}
                </h2>
                {album.description && (
                  <p className="text-neutral-500 text-sm mt-1 line-clamp-2">{album.description}</p>
                )}
                <p className="text-neutral-600 text-xs mt-2">{album._count.photos} photos</p>
              </Link>
              {showEdit && (
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      router.push(`/albums/${album.id}/edit`)
                    }}
                    className="text-neutral-400 hover:text-white transition-colors"
                    title="Edit album"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      handleDelete(album.id, album.name)
                    }}
                    className="text-neutral-400 hover:text-red-500 transition-colors"
                    title="Delete album"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
