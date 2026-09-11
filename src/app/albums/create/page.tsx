'use client'
import { useState, useEffect, useId } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass, fieldClassMultiline } from '@/components/ui/Field'
import Button, { ButtonLink } from '@/components/ui/Button'
import EmptyState, { PhotoIcon } from '@/components/ui/EmptyState'
import { AlbumFormSkeleton } from '@/components/ui/Skeleton'
import VisibilityToggle from '@/components/ui/VisibilityToggle'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

type Photo = {
  id: string
  thumbnailPath: string
  caption: string | null
}

export default function CreateAlbumPage() {
  // Prefix for this form's control ids, so a label points at its own field
  // even when the page renders the form twice.
  const fid = useId()

  const { status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [albumName, setAlbumName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status === 'authenticated') {
      // Fetch user's photos
      fetch('/api/photos/mine?pageSize=200')
        .then(r => r.json())
        .then(data => {
          // /api/photos/mine now pages and returns { photos, total }.
          setPhotos(Array.isArray(data?.photos) ? data.photos : [])
          setLoading(false)
        })
        .catch(() => {
          setPhotos([])
          setLoading(false)
        })
    }
  }, [status, router])

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    )
  }

  const handleCreate = async () => {
    if (!albumName.trim()) {
      toast('Please enter an album name', 'error')
      return
    }

    setCreating(true)

    try {
      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: albumName.trim(),
          description: description.trim() || null,
          public: isPublic,
          photoIds: selectedPhotoIds
        })
      })

      if (res.ok) {
        const album = await res.json()
        // Left running deliberately: the navigation is in flight and
        // re-enabling the button invites a second album.
        router.push(`/albums/${album.id}`)
        return
      }
      toast(await apiErrorMessage(res, 'Could not create the album'), 'error')
      setCreating(false)
    } catch {
      toast('Could not reach the server. Your selection is still here.', 'error')
      setCreating(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
        <ClientHeader />
        {/* The shape of the page that is coming, like every other route on
            the site, rather than a spinner on an empty screen. */}
        <main id="main-content" tabIndex={-1} className="flex-1" aria-busy="true">
          <span className="sr-only" role="status">Loading</span>
          <AlbumFormSkeleton />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />

      <main id="main-content" tabIndex={-1} className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-black text-white mb-8 tracking-tight">Create Album</h1>

          <div className="grid lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-1 space-y-5">
              <div className="bg-neutral-900/50 border border-neutral-800 p-5 space-y-5 sticky top-6">
                <div>
                  <FieldLabel htmlFor={`${fid}-album-name`} required>Album name</FieldLabel>
                  <input
                    id={`${fid}-album-name`}
                    type="text"
                    value={albumName}
                    onChange={e => setAlbumName(e.target.value)}
                    placeholder="Enter album name…"
                    className={`${fieldClass}`}
                  />
                </div>

                <div>
                  <FieldLabel htmlFor={`${fid}-album-description`}>Description</FieldLabel>
                  <textarea
                    id={`${fid}-album-description`}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Optional description…"
                    rows={3}
                    className={`${fieldClassMultiline} resize-none`}
                  />
                </div>

                <div className="pt-3 border-t border-neutral-800">
                  {/* An album is public or private the same way a photo is, so
                      it uses the same control. The album API stores it as a
                      boolean, which is the only reason for the mapping. */}
                  <VisibilityToggle
                    value={isPublic ? 'PUBLIC' : 'PRIVATE'}
                    onChange={next => setIsPublic(next === 'PUBLIC')}
                    label="Who can see this album"
                    hint={isPublic ? 'Anyone can find this album on AvoidXray.' : 'Only you can see this album.'}
                  />
                </div>

                {/* The same block as the edit page: the action the page
                    exists for, then a quiet way out. Cancel was a hand-rolled
                    grey box of the same size and weight as Create. */}
                <div className="pt-4 border-t border-neutral-800 space-y-3">
                  <p className="text-neutral-500 text-sm">
                    {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
                  </p>

                  <Button
                    onClick={handleCreate}
                    disabled={creating || !albumName.trim()} size="lg" fullWidth>
                    {creating ? 'Creating…' : 'Create Album'}
                  </Button>

                  <ButtonLink href="/albums" variant="ghost" fullWidth>
                    Cancel
                  </ButtonLink>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-white font-semibold text-lg">Select from Your Photos</h2>
                <p className="text-neutral-500 text-sm">Click on photos to add them to your album. You can add more photos later.</p>
              </div>

              {photos.length === 0 ? (
                <EmptyState
                  icon={<PhotoIcon />}
                  message="No photos in your account yet"
                  hint="Upload some photos first to create an album"
                  action={{ href: '/upload', label: 'Upload photos' }}
                />
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {Array.isArray(photos) && photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      onClick={() => togglePhoto(photo.id)}
                      aria-pressed={selectedPhotoIds.includes(photo.id)}
                      aria-label={`Select ${photo.caption?.trim() || `photo ${index + 1}`}`}
                      className={`aspect-square relative overflow-hidden transition-all ${
                        selectedPhotoIds.includes(photo.id)
                          ? 'ring-4 ring-brand scale-[0.95]'
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
                        <div className="absolute top-2 right-2 w-6 h-6 bg-brand rounded-full flex items-center justify-center shadow-lg">
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
