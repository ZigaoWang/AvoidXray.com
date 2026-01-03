'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Combobox from '@/components/Combobox'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import TagInput from '@/components/TagInput'

type Camera = { id: string; name: string; brand: string | null }
type FilmStock = { id: string; name: string; brand: string | null }
type UploadStatus = 'uploading' | 'done' | 'error'
type PhotoMeta = { caption: string; cameraId: string; filmStockId: string; tags: string[] }

async function resizeImage(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = (height / width) * maxSize; width = maxSize }
        else { width = (width / height) * maxSize; height = maxSize }
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85)
    }
    img.src = URL.createObjectURL(file)
  })
}

export default function UploadPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [previews, setPreviews] = useState<string[]>([])
  const [uploadStatus, setUploadStatus] = useState<UploadStatus[]>([])
  const [photoIds, setPhotoIds] = useState<(string | null)[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const publishedRef = useRef(false)

  const [bulkMeta, setBulkMeta] = useState<PhotoMeta>({ caption: '', cameraId: '', filmStockId: '', tags: [] })
  const [individualMeta, setIndividualMeta] = useState<PhotoMeta[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [filmStocks, setFilmStocks] = useState<FilmStock[]>([])
  const [newCameraName, setNewCameraName] = useState('')
  const [newFilmName, setNewFilmName] = useState('')

  useEffect(() => {
    fetch('/api/cameras').then(r => r.json()).then(setCameras)
    fetch('/api/filmstocks').then(r => r.json()).then(setFilmStocks)
  }, [])

  // Cleanup unpublished photos on page leave
  useEffect(() => {
    const cleanup = () => {
      if (publishedRef.current) return
      const ids = photoIds.filter(id => id)
      if (ids.length > 0) {
        navigator.sendBeacon('/api/upload/cleanup', JSON.stringify({ ids }))
      }
    }
    window.addEventListener('beforeunload', cleanup)
    return () => {
      window.removeEventListener('beforeunload', cleanup)
      cleanup()
    }
  }, [photoIds])

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    const startIdx = previews.length
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
    setUploadStatus(prev => [...prev, ...files.map(() => 'uploading' as UploadStatus)])
    setPhotoIds(prev => [...prev, ...files.map(() => null)])
    setIndividualMeta(prev => [...prev, ...files.map(() => ({ caption: '', cameraId: '', filmStockId: '', tags: [] }))])

    await Promise.all(files.map(async (file, i) => {
      const idx = startIdx + i
      try {
        const resized = await resizeImage(file, 2000)
        const formData = new FormData()
        formData.append('files', resized, file.name)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          setPhotoIds(prev => prev.map((id, j) => j === idx ? data.photos[0].id : id))
          setUploadStatus(prev => prev.map((s, j) => j === idx ? 'done' : s))
        } else {
          setUploadStatus(prev => prev.map((s, j) => j === idx ? 'error' : s))
        }
      } catch {
        setUploadStatus(prev => prev.map((s, j) => j === idx ? 'error' : s))
      }
    }))
  }, [previews.length])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    uploadFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')))
  }, [uploadFiles])

  const handlePublish = async () => {
    const doneIds = photoIds.filter((id, i) => id && uploadStatus[i] === 'done')
    if (!doneIds.length) return
    setPublishing(true)

    // Resolve new camera/film for bulk
    let resolvedCameraId = bulkMeta.cameraId
    let resolvedFilmStockId = bulkMeta.filmStockId

    if (resolvedCameraId?.startsWith('new-') && newCameraName) {
      const res = await fetch('/api/cameras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCameraName }) })
      if (res.ok) resolvedCameraId = (await res.json()).id
    }
    if (resolvedFilmStockId?.startsWith('new-') && newFilmName) {
      const res = await fetch('/api/filmstocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFilmName }) })
      if (res.ok) resolvedFilmStockId = (await res.json()).id
    }

    await Promise.all(photoIds.map(async (id, i) => {
      if (!id || uploadStatus[i] !== 'done') return

      // Use individual meta if set, otherwise fall back to bulk
      const ind = individualMeta[i]
      const meta = {
        caption: ind.caption || bulkMeta.caption,
        cameraId: ind.cameraId || resolvedCameraId,
        filmStockId: ind.filmStockId || resolvedFilmStockId,
        tags: ind.tags.length > 0 ? ind.tags : bulkMeta.tags
      }

      await fetch(`/api/photos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: meta.caption || null,
          cameraId: meta.cameraId?.startsWith('new-') ? null : (meta.cameraId || null),
          filmStockId: meta.filmStockId?.startsWith('new-') ? null : (meta.filmStockId || null),
          tags: meta.tags
        })
      })
    }))

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

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <main className="flex-1 max-w-5xl mx-auto w-full py-12 px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">Upload Photos</h1>
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
              <input type="file" multiple accept="image/*" onChange={e => { uploadFiles(Array.from(e.target.files || [])); e.target.value = '' }} className="hidden" id="file-input" />
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
                      {(individualMeta[i]?.caption || individualMeta[i]?.cameraId || individualMeta[i]?.filmStockId || individualMeta[i]?.tags.length > 0) && (
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

              <div className="grid grid-cols-2 gap-3">
                <Combobox
                  options={cameras}
                  value={currentMeta.cameraId}
                  onChange={id => setCurrentMeta({ ...currentMeta, cameraId: id })}
                  onCreate={async name => { setNewCameraName(name); const t = { id: `new-${Date.now()}`, name, brand: null }; setCameras(p => [...p, t]); return t }}
                  placeholder={isIndividual && bulkMeta.cameraId ? 'Using default' : 'Select...'}
                  label="Camera"
                />
                <Combobox
                  options={filmStocks}
                  value={currentMeta.filmStockId}
                  onChange={id => setCurrentMeta({ ...currentMeta, filmStockId: id })}
                  onCreate={async name => { setNewFilmName(name); const t = { id: `new-${Date.now()}`, name, brand: null }; setFilmStocks(p => [...p, t]); return t }}
                  placeholder={isIndividual && bulkMeta.filmStockId ? 'Using default' : 'Select...'}
                  label="Film Stock"
                />
              </div>

              <div>
                <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">Tags</label>
                <TagInput
                  value={isIndividual && currentMeta.tags.length === 0 ? bulkMeta.tags : currentMeta.tags}
                  onChange={tags => setCurrentMeta({ ...currentMeta, tags })}
                />
              </div>

              <button
                onClick={handlePublish}
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
    </div>
  )
}
