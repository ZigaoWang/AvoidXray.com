'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'

interface WatermarkProps {
  photoId: string
  camera?: string | null
  filmStock?: string | null
  takenDate?: string | null
  onClose: () => void
}

type WatermarkStyle = 'minimal' | 'film-strip' | 'polaroid'

const STYLES: { id: WatermarkStyle; name: string; description: string }[] = [
  { id: 'minimal', name: 'Minimal', description: 'Clean dark bar with refined typography' },
  { id: 'film-strip', name: 'Film Strip', description: 'Authentic 35mm film border with sprocket holes' },
  { id: 'polaroid', name: 'Polaroid', description: 'Classic instant photo style' },
]

export default function WatermarkGenerator({ photoId, camera, filmStock, takenDate, onClose }: WatermarkProps) {
  const [style, setStyle] = useState<WatermarkStyle>('polaroid')
  const [downloading, setDownloading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Customization options
  const [showCamera, setShowCamera] = useState(true)
  const [showFilm, setShowFilm] = useState(true)
  const [showUsername, setShowUsername] = useState(true)
  const [showDate, setShowDate] = useState(!!takenDate)
  const [showQR, setShowQR] = useState(true)
  const [showCaption, setShowCaption] = useState(true)
  const [customDate, setCustomDate] = useState(() => {
    if (takenDate) {
      const date = new Date(takenDate)
      return date.toISOString().split('T')[0]
    }
    return ''
  })
  const [customCaption, setCustomCaption] = useState('Shot on film')

  // Load preview when style or options change
  useEffect(() => {
    let cancelled = false
    setLoadingPreview(true)

    const loadPreview = async () => {
      try {
        const params = new URLSearchParams({
          id: photoId,
          style,
          preview: '1',
          showCamera: showCamera ? '1' : '0',
          showFilm: showFilm ? '1' : '0',
          showUsername: showUsername ? '1' : '0',
          showDate: showDate ? '1' : '0',
          showQR: showQR ? '1' : '0',
          showCaption: showCaption ? '1' : '0',
        })
        if (showCaption && customCaption) params.set('caption', customCaption)
        if (customDate) params.set('customDate', customDate)

        const response = await fetch(`/api/watermark?${params}`)
        if (!response.ok) throw new Error('Preview failed')
        const blob = await response.blob()
        if (!cancelled) {
          if (previewUrl) URL.revokeObjectURL(previewUrl)
          setPreviewUrl(URL.createObjectURL(blob))
        }
      } catch {
        // Silently fail preview
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [photoId, style, showCamera, showFilm, showUsername, showDate, showQR, showCaption, customDate, customCaption])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams({
        id: photoId,
        style,
        showCamera: showCamera ? '1' : '0',
        showFilm: showFilm ? '1' : '0',
        showUsername: showUsername ? '1' : '0',
        showDate: showDate ? '1' : '0',
        showQR: showQR ? '1' : '0',
        showCaption: showCaption ? '1' : '0',
      })
      if (showCaption && customCaption) params.set('caption', customCaption)
      if (customDate) params.set('customDate', customDate)

      const response = await fetch(`/api/watermark?${params}`)
      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `avoidxray-${photoId}.jpg`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Failed to generate watermark. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-neutral-900 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
          <div>
            <h2 className="text-white font-bold text-xl">Download with Watermark</h2>
            <p className="text-neutral-500 text-sm mt-1">Choose a style for your photo</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white p-2 -mr-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Preview */}
          <div className="lg:flex-1 p-5 bg-neutral-950">
            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Preview</p>
            <div className="relative aspect-[4/3] bg-black flex items-center justify-center">
              {loadingPreview && !previewUrl && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain"
                />
              )}
              {loadingPreview && previewUrl && (
                <div className="absolute top-2 right-2">
                  <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="lg:w-80 p-5 border-t lg:border-t-0 lg:border-l border-neutral-800">
            {/* Style selector */}
            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Style</p>
            <div className="space-y-2 mb-6">
              {STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`w-full text-left p-3 transition-all border ${
                    style === s.id
                      ? 'bg-[#D32F2F]/10 border-[#D32F2F] text-white'
                      : 'bg-neutral-800/50 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className={`text-xs mt-0.5 ${style === s.id ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        {s.description}
                      </div>
                    </div>
                    {style === s.id && (
                      <svg className="w-4 h-4 text-[#D32F2F] shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Customization options */}
            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Customize</p>
            <div className="space-y-3 mb-6">
              {camera && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCamera}
                    onChange={(e) => setShowCamera(e.target.checked)}
                    className="w-4 h-4 bg-neutral-800 border-neutral-700 text-[#D32F2F] focus:ring-[#D32F2F] focus:ring-offset-0"
                  />
                  <span className="text-neutral-300 text-sm">Show camera ({camera})</span>
                </label>
              )}
              {filmStock && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFilm}
                    onChange={(e) => setShowFilm(e.target.checked)}
                    className="w-4 h-4 bg-neutral-800 border-neutral-700 text-[#D32F2F] focus:ring-[#D32F2F] focus:ring-offset-0"
                  />
                  <span className="text-neutral-300 text-sm">Show film ({filmStock})</span>
                </label>
              )}
              {style === 'polaroid' && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCaption}
                      onChange={(e) => setShowCaption(e.target.checked)}
                      className="w-4 h-4 bg-neutral-800 border-neutral-700 text-[#D32F2F] focus:ring-[#D32F2F] focus:ring-offset-0"
                    />
                    <span className="text-neutral-300 text-sm">Show caption</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showQR}
                      onChange={(e) => setShowQR(e.target.checked)}
                      className="w-4 h-4 bg-neutral-800 border-neutral-700 text-[#D32F2F] focus:ring-[#D32F2F] focus:ring-offset-0"
                    />
                    <span className="text-neutral-300 text-sm">Show QR code</span>
                  </label>
                </>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDate}
                  onChange={(e) => setShowDate(e.target.checked)}
                  className="w-4 h-4 bg-neutral-800 border-neutral-700 text-[#D32F2F] focus:ring-[#D32F2F] focus:ring-offset-0"
                />
                <span className="text-neutral-300 text-sm">Show date</span>
              </label>

              {showDate && (
                <div>
                  <label className="text-neutral-400 text-xs mb-1 block">
                    {takenDate ? 'Date (from photo taken date)' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-[#D32F2F]"
                  />
                </div>
              )}

              {style === 'polaroid' && showCaption && (
                <>
                  <div>
                    <label className="text-neutral-400 text-xs mb-1 block">Caption</label>
                    <input
                      type="text"
                      value={customCaption}
                      onChange={(e) => setCustomCaption(e.target.value)}
                      placeholder="Shot on film"
                      maxLength={50}
                      className="w-full bg-neutral-800 border border-neutral-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-[#D32F2F]"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Photo info */}
            {(camera || filmStock) && (
              <div className="mb-6 p-3 bg-neutral-800/30 border border-neutral-800">
                <p className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Photo Info</p>
                <div className="text-neutral-300 text-sm space-y-1">
                  {camera && <p><span className="text-neutral-500">Camera:</span> {camera}</p>}
                  {filmStock && <p><span className="text-neutral-500">Film:</span> {filmStock}</p>}
                </div>
              </div>
            )}

            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full bg-[#D32F2F] text-white py-3 font-medium hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {downloading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="whitespace-nowrap">Download</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
