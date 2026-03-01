'use client'
import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Combobox from '@/components/Combobox'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import NewItemModal from '@/components/NewItemModal'
import MissingMetadataModal from '@/components/MissingMetadataModal'

type Camera = { id: string; name: string; brand: string | null }
type FilmStock = { id: string; name: string; brand: string | null }
type UploadStatus = 'uploading' | 'done' | 'error'
type PhotoMeta = { caption: string; cameraId: string; filmStockId: string; takenDate: string }
type Album = { id: string; name: string }
type NewItemData = {
  name: string
  description?: string
  image?: File
  cameraType?: string
  format?: string
  year?: string
  filmType?: string
  iso?: string
}
type TargetUser = { id: string; username: string; name: string | null }

function UploadPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const asUserId = searchParams.get('asUserId')

  const [previews, setPreviews] = useState<string[]>([])
  const [uploadStatus, setUploadStatus] = useState<UploadStatus[]>([])
  const [photoIds, setPhotoIds] = useState<(string | null)[]>([])
  const photoIdsRef = useRef<(string | null)[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const publishedRef = useRef(false)

  const [bulkMeta, setBulkMeta] = useState<PhotoMeta>({ caption: '', cameraId: '', filmStockId: '', takenDate: '' })
  const [individualMeta, setIndividualMeta] = useState<PhotoMeta[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [filmStocks, setFilmStocks] = useState<FilmStock[]>([])
  const [newCameraData, setNewCameraData] = useState<NewItemData | null>(null)
  const [newFilmData, setNewFilmData] = useState<NewItemData | null>(null)
  const [addToAlbum, setAddToAlbum] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [albumPublic, setAlbumPublic] = useState(false)
  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState('')
  const [albumsLoaded, setAlbumsLoaded] = useState(false)

  // Target user for "upload as user" feature
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loadingTargetUser, setLoadingTargetUser] = useState(false)

  // Modal states
  const [newItemModal, setNewItemModal] = useState<{ type: 'camera' | 'film'; initialName?: string } | null>(null)
  const [showMissingMetadataModal, setShowMissingMetadataModal] = useState(false)

  // Fetch target user info if asUserId is present
  useEffect(() => {
    if (!asUserId) {
      setTargetUser(null)
      return
    }

    setLoadingTargetUser(true)
    fetch(`/api/user?id=${asUserId}`)
      .then(r => {
        if (!r.ok) throw new Error('User not found')
        return r.json()
      })
      .then(data => {
        setTargetUser({ id: data.id, username: data.username, name: data.name })
      })
      .catch(() => {
        // If user not found, redirect back to admin
        alert('Target user not found')
        router.push('/admin')
      })
      .finally(() => setLoadingTargetUser(false))
  }, [asUserId, router])

  useEffect(() => {
    fetch('/api/cameras')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCameras(data)
        } else {
          setCameras([])
        }
      })
      .catch(() => setCameras([]))

    fetch('/api/filmstocks')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setFilmStocks(data)
        } else {
          setFilmStocks([])
        }
      })
      .catch(() => setFilmStocks([]))

    fetch('/api/albums')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlbums(data)
        } else {
          setAlbums([])
        }
        setAlbumsLoaded(true)
      })
      .catch(() => {
        setAlbums([])
        setAlbumsLoaded(true)
      })
  }, [])

  // Cleanup unpublished photos on unmount (client-side navigation)
  useEffect(() => {
    return () => {
      if (publishedRef.current) return
      const ids = photoIdsRef.current.filter(id => id)
      if (ids.length > 0) {
        // Use fetch for client-side navigation cleanup
        fetch('/api/upload/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
          keepalive: true
        }).catch(() => {})
      }
    }
  }, [])

  const removeImage = useCallback(async (idx: number) => {
    const photoId = photoIdsRef.current[idx]

    // Clean up OSS image if it was uploaded
    if (photoId) {
      fetch('/api/upload/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [photoId] }),
      }).catch(() => {})
    }

    // Remove from all state arrays
    setPreviews(prev => prev.filter((_, i) => i !== idx))
    setUploadStatus(prev => prev.filter((_, i) => i !== idx))
    setPhotoIds(prev => prev.filter((_, i) => i !== idx))
    setIndividualMeta(prev => prev.filter((_, i) => i !== idx))
    photoIdsRef.current = photoIdsRef.current.filter((_, i) => i !== idx)

    // Reset selection if the removed image was selected
    if (selectedIdx === idx) {
      setSelectedIdx(null)
    } else if (selectedIdx !== null && selectedIdx > idx) {
      setSelectedIdx(selectedIdx - 1)
    }
  }, [selectedIdx])

  // Helper to check if file is HEIC
  const isHeicFile = useCallback((file: File): boolean => {
    const name = file.name.toLowerCase()
    return name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif'
  }, [])

  // Create preview URL, converting HEIC if needed
  const createPreviewUrl = useCallback(async (file: File): Promise<string> => {
    const name = file.name.toLowerCase()
    const isHeic = name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif'

    if (isHeic) {
      try {
        // Dynamically import heic2any only when needed
        const heic2any = (await import('heic2any')).default
        const blob = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.8
        })
        const resultBlob = Array.isArray(blob) ? blob[0] : blob
        return URL.createObjectURL(resultBlob)
      } catch (error) {
        console.error('Failed to convert HEIC for preview:', error)
        // Return a placeholder or the original (which won't display)
        return URL.createObjectURL(file)
      }
    }
    return URL.createObjectURL(file)
  }, [])

  // Check if file is an image (including HEIC)
  const isImageFile = useCallback((file: File): boolean => {
    const name = file.name.toLowerCase()
    return file.type.startsWith('image/') ||
           name.endsWith('.heic') ||
           name.endsWith('.heif')
  }, [])

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    const startIdx = previews.length

    // Initialize arrays for new files
    const newNulls = files.map(() => null)
    photoIdsRef.current = [...photoIdsRef.current, ...newNulls]

    // Create preview URLs (converting HEIC if needed)
    const previewUrls = await Promise.all(files.map(f => createPreviewUrl(f)))

    setPreviews(prev => [...prev, ...previewUrls])
    setUploadStatus(prev => [...prev, ...files.map(() => 'uploading' as UploadStatus)])
    setPhotoIds(prev => [...prev, ...newNulls])
    setIndividualMeta(prev => [...prev, ...files.map(() => ({ caption: '', cameraId: '', filmStockId: '', takenDate: '' }))])

    // Upload sequentially to avoid SQLite write lock issues
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const idx = startIdx + i
      try {
        const formData = new FormData()
        formData.append('files', file)
        // Pass asUserId if uploading as another user
        if (asUserId) {
          formData.append('asUserId', asUserId)
        }
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          photoIdsRef.current[idx] = data.photos[0].id
          setPhotoIds([...photoIdsRef.current])
          setUploadStatus(prev => prev.map((s, j) => j === idx ? 'done' : s))
        } else {
          setUploadStatus(prev => prev.map((s, j) => j === idx ? 'error' : s))
        }
      } catch {
        setUploadStatus(prev => prev.map((s, j) => j === idx ? 'error' : s))
      }
    }
  }, [previews.length, asUserId, createPreviewUrl])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    uploadFiles(Array.from(e.dataTransfer.files).filter(isImageFile))
  }, [uploadFiles, isImageFile])

  // Handle new item modal submission
  const handleNewItemSubmit = (data: NewItemData) => {
    if (!newItemModal) return

    const { type } = newItemModal
    const { name } = data
    let tempItem: Camera | FilmStock

    if (type === 'camera') {
      tempItem = { id: `new-${Date.now()}`, name, brand: null }
      setNewCameraData(data)
      setCameras(p => [...p, tempItem])
      setBulkMeta(prev => ({ ...prev, cameraId: tempItem.id }))
    } else {
      tempItem = { id: `new-${Date.now()}`, name, brand: null }
      setNewFilmData(data)
      setFilmStocks(p => [...p, tempItem])
      setBulkMeta(prev => ({ ...prev, filmStockId: tempItem.id }))
    }

    setNewItemModal(null)
  }

  // Check for missing metadata before publishing
  const handlePublishClick = () => {
    const missingFields: ('camera' | 'film')[] = []
    if (!bulkMeta.cameraId) missingFields.push('camera')
    if (!bulkMeta.filmStockId) missingFields.push('film')

    if (missingFields.length > 0) {
      setShowMissingMetadataModal(true)
    } else {
      handlePublish()
    }
  }

  const handlePublish = async () => {
    const ids = photoIdsRef.current
    const doneIds = ids.filter((id, i) => id && uploadStatus[i] === 'done')
    if (!doneIds.length) return
    setPublishing(true)

    // Resolve new camera/film for bulk
    let resolvedCameraId = bulkMeta.cameraId
    let resolvedFilmStockId = bulkMeta.filmStockId

    if (resolvedCameraId?.startsWith('new-') && newCameraData) {
      const formData = new FormData()
      formData.append('name', newCameraData.name)
      if (newCameraData.description) formData.append('description', newCameraData.description)
      if (newCameraData.image) formData.append('image', newCameraData.image)
      if (newCameraData.cameraType) formData.append('cameraType', newCameraData.cameraType)
      if (newCameraData.format) formData.append('format', newCameraData.format)
      if (newCameraData.year) formData.append('year', newCameraData.year)

      const res = await fetch('/api/cameras', { method: 'POST', body: formData })
      if (res.ok) resolvedCameraId = (await res.json()).id
    }
    if (resolvedFilmStockId?.startsWith('new-') && newFilmData) {
      const formData = new FormData()
      formData.append('name', newFilmData.name)
      if (newFilmData.description) formData.append('description', newFilmData.description)
      if (newFilmData.image) formData.append('image', newFilmData.image)
      if (newFilmData.filmType) formData.append('filmType', newFilmData.filmType)
      if (newFilmData.format) formData.append('format', newFilmData.format)
      if (newFilmData.iso) formData.append('iso', newFilmData.iso)

      const res = await fetch('/api/filmstocks', { method: 'POST', body: formData })
      if (res.ok) resolvedFilmStockId = (await res.json()).id
    }

    await Promise.all(ids.map(async (id, i) => {
      if (!id || uploadStatus[i] !== 'done') return

      // Use individual meta if set, otherwise fall back to bulk
      const ind = individualMeta[i]
      const meta = {
        caption: ind.caption || bulkMeta.caption,
        cameraId: ind.cameraId || resolvedCameraId,
        filmStockId: ind.filmStockId || resolvedFilmStockId,
        takenDate: ind.takenDate || bulkMeta.takenDate
      }

      const finalCameraId = meta.cameraId?.startsWith('new-') ? null : (meta.cameraId || null)
      const finalFilmStockId = meta.filmStockId?.startsWith('new-') ? null : (meta.filmStockId || null)

      try {
        const res = await fetch(`/api/photos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: meta.caption || null,
            cameraId: finalCameraId,
            filmStockId: finalFilmStockId,
            takenDate: meta.takenDate || null
          })
        })

        if (!res.ok) {
          const error = await res.json().catch(() => ({}))
          console.error(`Failed to publish photo ${id}:`, error)
        }
      } catch (error) {
        console.error(`Error publishing photo ${id}:`, error)
      }
    }))

    // Create or add to album if requested
    if (addToAlbum && (albumName.trim() || selectedAlbumId)) {
      const photoIdsToAdd = doneIds.filter(id => id !== null)

      if (selectedAlbumId) {
        // Add to existing album
        await fetch(`/api/albums/${selectedAlbumId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addPhotoIds: photoIdsToAdd })
        })
      } else if (albumName.trim()) {
        // Create new album
        await fetch('/api/albums', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: albumName.trim(),
            public: albumPublic,
            photoIds: photoIdsToAdd
          })
        })
      }
    }

    publishedRef.current = true
    router.push('/')
  }

  if (status === 'loading') return null
  if (!session) { router.push('/login'); return null }

  const doneCount = uploadStatus.filter(s => s === 'done').length
  const uploadingCount = uploadStatus.filter(s => s === 'uploading').length
  const isIndividual = selectedIdx !== null
  const currentMeta = isIndividual ? individualMeta[selectedIdx] : bulkMeta

  const setCurrentMeta = (m: PhotoMeta) => {
    if (isIndividual) setIndividualMeta(prev => prev.map((p, i) => i === selectedIdx ? m : p))
    else setBulkMeta(m)
  }

  // Show loading state while fetching target user
  if (asUserId && loadingTargetUser) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-neutral-500">Loading user info...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <main className="flex-1 max-w-5xl mx-auto w-full py-12 px-6">
        {/* Admin Upload As User Banner */}
        {targetUser && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-yellow-500 font-medium">Admin Mode: Uploading as another user</p>
                <p className="text-yellow-500/70 text-sm">
                  Photos will be attributed to <span className="font-bold">@{targetUser.username}</span>
                  {targetUser.name && <span> ({targetUser.name})</span>}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="px-3 py-1 text-sm text-yellow-500 hover:text-yellow-400 border border-yellow-500/30 hover:border-yellow-500/50"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            {targetUser ? `Upload for @${targetUser.username}` : 'Upload Photos'}
          </h1>
          <p className="text-neutral-500 mt-1">Drop images to start uploading instantly</p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left: Upload & Preview */}
          <div className="lg:col-span-3 space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
              className={`border-2 border-dashed p-10 text-center transition-all ${isDragging ? 'border-[#D32F2F] bg-[#D32F2F]/5' : 'border-neutral-700 hover:border-neutral-600'}`}
            >
              <input type="file" multiple accept="image/*,.heic,.heif" onChange={e => { uploadFiles(Array.from(e.target.files || []).filter(isImageFile)); e.target.value = '' }} className="hidden" id="file-input" />
              <label htmlFor="file-input" className="cursor-pointer block">
                <div className="text-neutral-400 mb-2">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Drop images here or click to browse
                </div>
                <p className="text-neutral-600 text-xs">JPG, PNG, TIFF • Uploads start immediately</p>
              </label>
            </div>

            {previews.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">
                    {uploadingCount > 0 ? (
                      <span className="text-yellow-500">{uploadingCount} uploading...</span>
                    ) : (
                      <span className="text-green-500">{doneCount} ready</span>
                    )}
                    <span className="text-neutral-600 ml-2">/ {previews.length} total</span>
                  </span>
                  {isIndividual && (
                    <button onClick={() => setSelectedIdx(null)} className="px-3 py-1 bg-[#D32F2F] text-white text-xs font-medium hover:bg-[#B71C1C]">
                      ← All Photos
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {previews.map((url, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                      className={`aspect-square overflow-hidden bg-neutral-900 relative cursor-pointer transition-all ${
                        selectedIdx === i ? 'ring-2 ring-[#D32F2F] scale-[1.02]' : 'hover:opacity-80'
                      }`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(i) }}
                        className="absolute top-1.5 left-1.5 text-white hover:text-red-500 z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                        title="Remove"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      {uploadStatus[i] === 'uploading' && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {uploadStatus[i] === 'done' && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      {uploadStatus[i] === 'error' && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      )}
                      {/* Individual meta indicator */}
                      {(individualMeta[i]?.caption || individualMeta[i]?.cameraId || individualMeta[i]?.filmStockId || individualMeta[i]?.takenDate) && (
                        <div className="absolute bottom-1 left-1 w-2 h-2 bg-blue-500 rounded-full" title="Has custom metadata" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Metadata */}
          <div className="lg:col-span-2">
            <div className="bg-neutral-900/50 border border-neutral-800 p-5 space-y-5">
              <div className="border-b border-neutral-800 pb-4">
                <h2 className="text-white font-semibold">
                  {isIndividual ? `Photo ${selectedIdx + 1}` : 'All Photos'}
                </h2>
                <p className="text-neutral-500 text-xs mt-1">
                  {isIndividual
                    ? 'Editing this photo only. Leave blank to use default.'
                    : 'Default metadata for all photos. Click a photo to customize.'}
                </p>
              </div>

              <div>
                <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">Caption</label>
                <input
                  type="text"
                  value={currentMeta.caption}
                  onChange={e => setCurrentMeta({ ...currentMeta, caption: e.target.value })}
                  placeholder={isIndividual ? bulkMeta.caption || 'No default caption' : 'Enter caption...'}
                  className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none placeholder:text-neutral-600"
                />
              </div>

              <div>
                <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">Taken Date</label>
                <input
                  type="date"
                  value={currentMeta.takenDate}
                  onChange={e => setCurrentMeta({ ...currentMeta, takenDate: e.target.value })}
                  placeholder={isIndividual ? bulkMeta.takenDate || 'No default date' : 'Select date...'}
                  className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none placeholder:text-neutral-600"
                />
              </div>

              <div className="space-y-4">
                <Combobox
                  options={cameras}
                  value={currentMeta.cameraId}
                  onChange={id => setCurrentMeta({ ...currentMeta, cameraId: id })}
                  placeholder={isIndividual && bulkMeta.cameraId ? 'Using default' : 'Select...'}
                  label="Camera"
                  onAddNewClick={() => setNewItemModal({ type: 'camera' })}
                />
                <Combobox
                  options={filmStocks}
                  value={currentMeta.filmStockId}
                  onChange={id => setCurrentMeta({ ...currentMeta, filmStockId: id })}
                  placeholder={isIndividual && bulkMeta.filmStockId ? 'Using default' : 'Select...'}
                  label="Film Stock"
                  onAddNewClick={() => setNewItemModal({ type: 'film' })}
                />
              </div>

              <div className="border-t border-neutral-800 pt-5">
                <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={addToAlbum}
                      onChange={e => setAddToAlbum(e.target.checked)}
                      className="w-5 h-5 bg-neutral-800 border-2 border-neutral-700 checked:bg-[#D32F2F] checked:border-[#D32F2F] focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className="text-white font-semibold text-sm block group-hover:text-[#D32F2F] transition-colors">
                        Add to Album
                      </span>
                      <span className="text-neutral-500 text-xs">
                        Organize these photos into an album
                      </span>
                    </div>
                  </label>

                  {addToAlbum && (
                    <div className="pt-2 space-y-3 border-t border-neutral-800">
                      <div>
                        <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
                          {selectedAlbumId ? 'Add to Existing Album' : 'Create New Album'}
                        </label>
                        <select
                          value={selectedAlbumId}
                          onChange={e => {
                            setSelectedAlbumId(e.target.value)
                            if (e.target.value) setAlbumName('')
                          }}
                          className="w-full p-3 bg-neutral-800 text-white border border-neutral-700 focus:border-[#D32F2F] focus:outline-none text-sm"
                        >
                          <option value="">+ Create new album</option>
                          {albumsLoaded && Array.isArray(albums) && albums.length > 0 && (
                            <optgroup label="Your Albums">
                              {albums.map(album => (
                                <option key={album.id} value={album.id}>{album.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {!selectedAlbumId && (
                        <>
                          <div>
                            <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">Album Name</label>
                            <input
                              type="text"
                              value={albumName}
                              onChange={e => setAlbumName(e.target.value)}
                              placeholder="e.g., Summer 2024, Street Photography..."
                              className="w-full p-3 bg-neutral-800 text-white border border-neutral-700 focus:border-[#D32F2F] focus:outline-none placeholder:text-neutral-600 text-sm"
                            />
                          </div>
                          <div className="flex items-center justify-between py-2">
                            <div>
                              <span className="block text-neutral-400 text-xs uppercase tracking-wider">Public Album</span>
                              <span className="text-neutral-500 text-xs">Others can discover and view</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAlbumPublic(!albumPublic)}
                              className={`relative w-10 h-5 rounded-full transition-colors ${
                                albumPublic ? 'bg-[#D32F2F]' : 'bg-neutral-700'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                  albumPublic ? 'left-5' : 'left-0.5'
                                }`}
                              />
                            </button>
                          </div>
                        </>
                      )}

                      {selectedAlbumId && Array.isArray(albums) && albums.length > 0 && (
                        <div className="flex items-center gap-2 text-neutral-500 text-xs">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Photos will be added to "{albums.find(a => a.id === selectedAlbumId)?.name}"</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handlePublishClick}
                disabled={publishing || doneCount === 0 || uploadingCount > 0}
                className="w-full bg-[#D32F2F] text-white py-4 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {publishing ? 'Publishing...' : uploadingCount > 0 ? `Uploading ${uploadingCount}...` : `Publish ${doneCount} Photo${doneCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* New Item Modal */}
      {newItemModal && (
        <NewItemModal
          type={newItemModal.type}
          initialName={newItemModal.initialName}
          onSubmit={handleNewItemSubmit}
          onCancel={() => setNewItemModal(null)}
        />
      )}

      {/* Missing Metadata Warning Modal */}
      {showMissingMetadataModal && (
        <MissingMetadataModal
          missingFields={[
            ...(!bulkMeta.cameraId ? ['camera' as const] : []),
            ...(!bulkMeta.filmStockId ? ['film' as const] : [])
          ]}
          onContinue={() => {
            setShowMissingMetadataModal(false)
            handlePublish()
          }}
          onCancel={() => setShowMissingMetadataModal(false)}
        />
      )}
    </div>
  )
}

// Wrap with Suspense for useSearchParams
export default function UploadPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    }>
      <UploadPageContent />
    </Suspense>
  )
}
