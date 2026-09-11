'use client'
import { useState, useEffect, useId } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import AlbumPhotoPicker from '@/components/AlbumPhotoPicker'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass, fieldClassMultiline } from '@/components/ui/Field'
import Button, { ButtonLink } from '@/components/ui/Button'
import { AlbumFormSkeleton } from '@/components/ui/Skeleton'
import VisibilityToggle from '@/components/ui/VisibilityToggle'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { apiErrorMessage } from '@/lib/apiError'
import { textLinkClass } from '@/components/ui/TextLink'

type Photo = {
  id: string
  thumbnailPath: string
  caption: string | null
}

type AlbumPhoto = {
  id: string
  photo: Photo
}

export default function EditAlbumPage() {
  // Prefix for this form's control ids, so a label points at its own field
  // even when the page renders the form twice.
  const fid = useId()

  const params = useParams()
  const albumId = params?.id as string
  const { data: session, status } = useSession()
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const router = useRouter()
  const { toast } = useToast()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /**
   * The photos this album already holds, thumbnails and all.
   *
   * Handed to the picker so that a member always has a tile to click, whatever
   * page of your library it would otherwise fall on. The album's own response
   * carries them, so this costs no extra request — and unlike a page of
   * /api/photos/mine it is guaranteed to contain every one of them.
   */
  const [albumPhotos, setAlbumPhotos] = useState<Photo[]>([])
  const [albumName, setAlbumName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [currentPhotoIds, setCurrentPhotoIds] = useState<string[]>([])
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  // Which kind of failure, not merely that there was one. "It may have been
  // deleted" and "the server did not answer" are different sentences, and only
  // one of them is worth pressing Try again on.
  const [loadFailed, setLoadFailed] = useState<'missing' | 'unreachable' | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status === 'authenticated' && albumId) {
      // A 404 from this endpoint is still JSON, and `{ error: 'Album not
      // found' }` is truthy. Unchecked it reached setAlbum, and a deleted
      // album, a mistyped id or somebody else's private album all rendered as
      // "Edit Album" over a blank name, no description and no photos, with
      // nothing on the page saying the album had never loaded. The photo
      // editor beside it already fails this case properly.
      //
      // The status rides along on the rejection, because otherwise both
      // causes land on the same dead end. A 404 or a 403 is the server
      // answering; a 5xx or a dropped connection is not, and telling somebody
      // their album may have been deleted when the box merely fell over sends
      // them looking for something that is still sitting there.
      fetch(`/api/albums/${albumId}`).then(r =>
        r.ok ? r.json() : Promise.reject(new Error(r.status >= 500 ? 'unreachable' : 'missing'))
      ).then(albumData => {
        // A public album answers to anyone who asks for it, so loading one is
        // not permission to change it. Unchecked, the whole editor rendered
        // over somebody else's album, fully interactive, and only refused at
        // the point of saving, where the API returns a 403.
        if (albumData.userId !== viewerId) {
          setLoadFailed('missing')
          setLoading(false)
          return
        }
        setAlbumName(albumData.name || '')
        setDescription(albumData.description || '')
        setIsPublic(albumData.public || false)
        const members: Photo[] = Array.isArray(albumData.photos)
          ? albumData.photos.map((p: AlbumPhoto) => p.photo)
          : []
        const photoIds = members.map(p => p.id)
        setCurrentPhotoIds(photoIds)
        setSelectedPhotoIds(photoIds)
        setAlbumPhotos(members)
        setLoading(false)
      }).catch((err: unknown) => {
        setLoading(false)
        // Anything that is not the server saying no — a thrown fetch, a 5xx —
        // is unreachable, which is the message that offers a retry.
        setLoadFailed(err instanceof Error && err.message === 'missing' ? 'missing' : 'unreachable')
      })
    }
  }, [status, albumId, router, viewerId])

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    )
  }

  const handleSave = async () => {
    if (!albumName.trim()) {
      toast('Please enter an album name', 'error')
      return
    }

    setSaving(true)

    // Determine what photos to add and remove
    const addPhotoIds = selectedPhotoIds.filter(id => !currentPhotoIds.includes(id))
    const removePhotoIds = currentPhotoIds.filter(id => !selectedPhotoIds.includes(id))

    try {
      const res = await fetch(`/api/albums/${albumId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: albumName.trim(),
          description: description.trim() || null,
          public: isPublic,
          addPhotoIds: addPhotoIds.length > 0 ? addPhotoIds : undefined,
          removePhotoIds: removePhotoIds.length > 0 ? removePhotoIds : undefined
        })
      })

      if (res.ok) {
        router.push(`/albums/${albumId}`)
        return
      }
      toast(await apiErrorMessage(res, 'Could not save the album'), 'error')
    } catch {
      toast('Could not reach the server. Your changes are still here.', 'error')
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/albums')
        return
      }
      toast(await apiErrorMessage(res, 'Could not delete the album'), 'error')
    } catch {
      toast('Could not reach the server', 'error')
    }
    setConfirmingDelete(false)
  }

  // Inside the site's chrome, the way the settings page fails. Without the
  // header and the footer this was a black page carrying one sentence, with
  // the reader dropped clean out of AvoidXray and no route back in.
  if (loadFailed) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
        <ClientHeader />
        <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            {loadFailed === 'missing' ? (
              <>
                <h1 className="text-2xl font-bold text-white mb-2">This album could not be opened</h1>
                <p className="text-neutral-500 mb-6">It may have been deleted, or it may not be yours to edit.</p>
                {/* Nothing to retry — the server already answered — so the way
                    out is the quiet one. */}
                <Link href="/albums" className={textLinkClass}>Back to your albums</Link>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-white mb-2">This album could not be loaded</h1>
                <p className="text-neutral-500 mb-6">Could not reach the server. Nothing has been changed.</p>
                <Button onClick={() => window.location.reload()} size="sm">Try again</Button>
              </>
            )}
          </div>
        </main>
        <Footer />
      </div>
    )
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
          <h1 className="text-3xl font-black text-white mb-8 tracking-tight">Edit Album</h1>

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

                {/*
                  One loud action, one quiet one, and the dangerous one kept
                  away from both.

                  Save, Cancel and Delete were three full-width boxes of the
                  same height stacked in a column — a hand-rolled gray one and
                  a red-outlined one flanking the shared Button — so nothing
                  in the panel said which of the three the page was for, and
                  Delete carried the same weight as Save.
                */}
                <div className="pt-4 border-t border-neutral-800 space-y-3">
                  <p className="text-neutral-500 text-sm">
                    {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
                  </p>

                  <Button
                    onClick={handleSave}
                    disabled={saving || !albumName.trim()} size="lg" fullWidth>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>

                  <ButtonLink href={`/albums/${albumId}`} variant="ghost" fullWidth>
                    Cancel
                  </ButtonLink>
                </div>

                {/* Below the fold of the decision you came here to make, and
                    labeled with what it costs, because the photos surviving
                    an album's deletion is the part people do not expect. */}
                <div className="pt-4 border-t border-neutral-800">
                  <Button
                    variant="destructive"
                    size="sm"
                    fullWidth
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete Album
                  </Button>
                  <p className="text-neutral-600 text-xs mt-2 text-center">
                    The photos in it stay in your library.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-white font-semibold text-lg">Manage Album Photos</h2>
                <p className="text-neutral-500 text-sm">Click photos to add or remove them from this album</p>
              </div>

              {/* The same picker the create page uses. The album's own photos
                  go in as pinned, so its "This album" view holds every member
                  — the one sitting 900 frames down your library was counted in
                  the selection but had no tile, and could never be taken out. */}
              <AlbumPhotoPicker
                selectedIds={selectedPhotoIds}
                onToggle={togglePhoto}
                pinned={albumPhotos}
                emptyHint="Upload some photos to add to this album"
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete “${albumName}”?`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmingDelete(false)}
      >
        The album is removed, but the photos in it are not. They stay on your profile and
        everywhere else they appear.
      </ConfirmDialog>
    </div>
  )
}
