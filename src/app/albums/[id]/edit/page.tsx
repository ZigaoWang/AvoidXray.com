'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'

type Photo = {
  id: string
  thumbnailPath: string
  caption: string | null
}

type AlbumPhoto = {
  id: string
  photo: Photo
}

type Album = {
  id: string
  name: string
  description: string | null
  photos: AlbumPhoto[]
}

export default function EditAlbumPage() {
  const params = useParams()
  const albumId = params?.id as string
  const { data: session, status } = useSession()
  const router = useRouter()
  const [album, setAlbum] = useState<Album | null>(null)
  const [allPhotos, setAllPhotos] = useState<Photo[]>([])
  const [albumName, setAlbumName] = useState('')
  const [description, setDescription] = useState('')
  const [currentPhotoIds, setCurrentPhotoIds] = useState<string[]>([])
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status === 'authenticated' && albumId) {
      Promise.all([
        fetch(`/api/albums/${albumId}`).then(r => r.json()),
        fetch('/api/photos/mine').then(r => r.json())
      ]).then(([albumData, photosData]) => {
        setAlbum(albumData)
        setAlbumName(albumData.name)
        setDescription(albumData.description || '')
        const photoIds = albumData.photos.map((p: AlbumPhoto) => p.photo.id)
        setCurrentPhotoIds(photoIds)
        setSelectedPhotoIds(photoIds)
        setAllPhotos(photosData)
        setLoading(false)
      })
    }
  }, [status, albumId, router])

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    )
  }

  const handleSave = async () => {
    if (!albumName.trim()) {
      alert('Please enter an album name')
      return
    }

    setSaving(true)

    // Determine what photos to add and remove
    const addPhotoIds = selectedPhotoIds.filter(id => !currentPhotoIds.includes(id))
    const removePhotoIds = currentPhotoIds.filter(id => !selectedPhotoIds.includes(id))

    const res = await fetch(`/api/albums/${albumId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: albumName.trim(),
        description: description.trim() || null,
        addPhotoIds: addPhotoIds.length > 0 ? addPhotoIds : undefined,
        removePhotoIds: removePhotoIds.length > 0 ? removePhotoIds : undefined
      })
    })

    if (res.ok) {
      router.push(`/albums/${albumId}`)
    } else {
      alert('Failed to update album')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the album "${albumName}"? Photos will not be deleted.`)) {
      return
    }

    const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/albums')
    } else {
      alert('Failed to delete album')
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <ClientHeader />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-black text-white mb-8 tracking-tight">Edit Album</h1>

          <div className="grid lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-1 space-y-5">
              <div className="bg-neutral-900/50 border border-neutral-800 p-5 space-y-5 sticky top-6">
                <div>
                  <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">Album Name *</label>
                  <input
                    type="text"
                    value={albumName}
                    onChange={e => setAlbumName(e.target.value)}
                    placeholder="Enter album name..."
                    className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none placeholder:text-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={3}
                    className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none placeholder:text-neutral-600 resize-none"
                  />
                </div>

                <div className="pt-3 border-t border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-2">
                    {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
                  </p>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving || !albumName.trim()}
                  className="w-full bg-[#D32F2F] text-white py-4 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>

                <button
                  onClick={() => router.push(`/albums/${albumId}`)}
                  className="w-full bg-neutral-800 text-white py-3 text-sm font-medium hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={handleDelete}
                  className="w-full bg-transparent border border-red-800 text-red-500 py-3 text-sm font-medium hover:bg-red-900/20 transition-colors"
                >
                  Delete Album
                </button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-white font-semibold text-lg">Select Photos</h2>
                <p className="text-neutral-500 text-sm">Click on photos to add or remove them from the album</p>
              </div>

              {allPhotos.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-neutral-800">
                  <p className="text-neutral-500 mb-4">No photos yet</p>
                  <a
                    href="/upload"
                    className="inline-block px-5 py-2.5 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors"
                  >
                    Upload Photos
                  </a>
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {allPhotos.map(photo => (
                    <button
                      key={photo.id}
                      onClick={() => togglePhoto(photo.id)}
                      className={`aspect-square relative overflow-hidden transition-all ${
                        selectedPhotoIds.includes(photo.id)
                          ? 'ring-4 ring-[#D32F2F] scale-[0.95]'
                          : 'hover:opacity-80'
                      }`}
                    >
                      <Image
                        src={photo.thumbnailPath}
                        alt={photo.caption || ''}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 33vw, 20vw"
                      />
                      {selectedPhotoIds.includes(photo.id) && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-[#D32F2F] rounded-full flex items-center justify-center shadow-lg">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
