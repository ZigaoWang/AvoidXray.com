'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useToast } from './ui/Toast'

type SuggestEditModalProps = {
  type: 'camera' | 'filmstock'
  id: string
  name: string
  brand: string | null
  currentImage: string | null
  currentDescription: string | null
  // Camera props
  cameraType?: string | null
  format?: string | null
  year?: number | null
  // Film props
  filmType?: string | null
  iso?: number | null
  onClose: () => void
}

export default function SuggestEditModal({
  type,
  id,
  name,
  brand,
  currentImage,
  currentDescription,
  cameraType: initialCameraType,
  format: initialFormat,
  year: initialYear,
  filmType: initialFilmType,
  iso: initialIso,
  onClose
}: SuggestEditModalProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [description, setDescription] = useState(currentDescription || '')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Camera fields
  const [cameraType, setCameraType] = useState(initialCameraType || '')
  const [format, setFormat] = useState(initialFormat || '')
  const [year, setYear] = useState(initialYear?.toString() || '')

  // Film fields
  const [filmType, setFilmType] = useState(initialFilmType || '')
  const [iso, setIso] = useState(initialIso?.toString() || '')

  // Custom "Other" values
  const [customCameraType, setCustomCameraType] = useState('')
  const [customFormat, setCustomFormat] = useState('')
  const [customFilmType, setCustomFilmType] = useState('')

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-900 border border-neutral-800 p-8 max-w-md w-full">
          <h2 className="text-xl font-bold text-white mb-4">Sign in required</h2>
          <p className="text-neutral-400 mb-6">
            You need to sign in to suggest edits.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/login')}
              className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-2 font-medium"
            >
              Sign In
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async () => {
    // Check if any changes were made
    const descriptionChanged = description !== currentDescription
    const hasCategorizationChanges = type === 'camera'
      ? (cameraType || format || year)
      : (filmType || format || iso)

    if (!imageFile && !descriptionChanged && !hasCategorizationChanges) {
      toast('Please make some changes to submit', 'error')
      return
    }

    // Validate "Other" custom fields
    if (type === 'camera') {
      if (cameraType === 'Other' && !customCameraType.trim()) {
        toast('Please specify the custom camera type', 'error')
        return
      }
      if (format === 'Other' && !customFormat.trim()) {
        toast('Please specify the custom format', 'error')
        return
      }
    } else {
      if (filmType === 'Other' && !customFilmType.trim()) {
        toast('Please specify the custom film type', 'error')
        return
      }
      if (format === 'Other' && !customFormat.trim()) {
        toast('Please specify the custom format', 'error')
        return
      }
    }

    setUploading(true)
    try {
      const formData = new FormData()
      if (imageFile) {
        formData.append('image', imageFile)
      }
      formData.append('description', description)

      // Add categorization fields with "Other" handling
      if (type === 'camera') {
        const finalCameraType = cameraType === 'Other' ? customCameraType : cameraType
        const finalFormat = format === 'Other' ? customFormat : format

        if (finalCameraType) formData.append('cameraType', finalCameraType)
        if (finalFormat) formData.append('format', finalFormat)
        if (year) formData.append('year', year)
      } else {
        const finalFilmType = filmType === 'Other' ? customFilmType : filmType
        const finalFormat = format === 'Other' ? customFormat : format

        if (finalFilmType) formData.append('filmType', finalFilmType)
        if (finalFormat) formData.append('format', finalFormat)
        if (iso) formData.append('iso', iso)
      }

      const endpoint = type === 'camera' ? `/api/cameras/${id}/image` : `/api/filmstocks/${id}/image`
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit')
      }

      toast(data.message || 'Edit submitted successfully!', 'success')
      onClose()

      // Refresh the page data without full reload
      router.refresh()
    } catch (error: any) {
      console.error('Submit error:', error)
      toast(error.message || 'Failed to submit edit', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-6">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl my-4 md:my-8">
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white">Suggest Edit</h2>
              <p className="text-neutral-500 text-sm mt-1">
                {brand ? `${brand} ${name}` : name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-white flex-shrink-0 ml-4"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4 md:space-y-6">
          {/* Current Image */}
          {currentImage && (
            <div>
              <label className="block text-xs md:text-sm text-neutral-400 mb-2">Current Image</label>
              <div className="relative aspect-square w-full max-w-[200px] md:max-w-xs bg-neutral-800">
                <Image
                  src={currentImage}
                  alt={name}
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          )}

          {/* New Image Upload */}
          <div>
            <label className="block text-xs md:text-sm text-neutral-400 mb-2">
              {currentImage ? 'Replace Image' : 'Upload Image'}
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="block w-full text-xs md:text-sm text-neutral-400
                file:mr-2 md:file:mr-3 file:py-2 file:px-3
                file:border-0 file:text-xs md:file:text-sm file:font-medium
                file:bg-neutral-800 file:text-white
                hover:file:bg-neutral-700"
            />
            <p className="text-xs text-neutral-600 mt-1">
              PNG with transparent background recommended
            </p>
          </div>

          {/* Preview */}
          {previewUrl && (
            <div>
              <label className="block text-xs md:text-sm text-neutral-400 mb-2">Preview</label>
              <div className="relative aspect-square w-full max-w-[200px] md:max-w-xs bg-neutral-800">
                <Image
                  src={previewUrl}
                  alt="Preview"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs md:text-sm text-neutral-400 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Tell users about this ${type}...`}
              className="w-full bg-neutral-800 text-white p-3 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none resize-none"
              rows={4}
            />
          </div>

          {/* Camera Categorization Fields */}
          {type === 'camera' && (
            <div className="bg-neutral-800 border border-neutral-800 rounded-sm">
              <div className="border-b border-neutral-700 px-4 py-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Camera Details</h3>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-2">Type</label>
                    <select
                      value={cameraType}
                      onChange={(e) => setCameraType(e.target.value)}
                      className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F]"
                    >
                      <option value="">Select type...</option>
                      <option value="SLR">SLR</option>
                      <option value="Rangefinder">Rangefinder</option>
                      <option value="Point & Shoot">Point & Shoot</option>
                      <option value="TLR">TLR</option>
                      <option value="Medium Format">Medium Format</option>
                      <option value="Large Format">Large Format</option>
                      <option value="Instant">Instant</option>
                      <option value="Other">Other</option>
                    </select>
                    {cameraType === 'Other' && (
                      <input
                        type="text"
                        value={customCameraType}
                        onChange={(e) => setCustomCameraType(e.target.value)}
                        placeholder="e.g. Pinhole"
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F] mt-2"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-2">Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F]"
                    >
                      <option value="">Select format...</option>
                      <option value="35mm">35mm</option>
                      <option value="120">120</option>
                      <option value="4x5">4x5</option>
                      <option value="8x10">8x10</option>
                      <option value="Instant">Instant</option>
                      <option value="Other">Other</option>
                    </select>
                    {format === 'Other' && (
                      <input
                        type="text"
                        value={customFormat}
                        onChange={(e) => setCustomFormat(e.target.value)}
                        placeholder="e.g. 127"
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F] mt-2"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-2">Year Released</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="1990"
                    min="1800"
                    max={new Date().getFullYear()}
                    className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Film Categorization Fields */}
          {type === 'filmstock' && (
            <div className="bg-neutral-800 border border-neutral-800 rounded-sm">
              <div className="border-b border-neutral-700 px-4 py-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Film Details</h3>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-2">Type</label>
                    <select
                      value={filmType}
                      onChange={(e) => setFilmType(e.target.value)}
                      className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F]"
                    >
                      <option value="">Select type...</option>
                      <option value="Color Negative">Color Negative</option>
                      <option value="Black & White">Black & White</option>
                      <option value="Slide">Slide</option>
                      <option value="Instant">Instant</option>
                      <option value="Other">Other</option>
                    </select>
                    {filmType === 'Other' && (
                      <input
                        type="text"
                        value={customFilmType}
                        onChange={(e) => setCustomFilmType(e.target.value)}
                        placeholder="e.g. Infrared"
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F] mt-2"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-2">Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F]"
                    >
                      <option value="">Select format...</option>
                      <option value="35mm">35mm</option>
                      <option value="120">120</option>
                      <option value="4x5">4x5</option>
                      <option value="8x10">8x10</option>
                      <option value="Instant">Instant</option>
                      <option value="Other">Other</option>
                    </select>
                    {format === 'Other' && (
                      <input
                        type="text"
                        value={customFormat}
                        onChange={(e) => setCustomFormat(e.target.value)}
                        placeholder="e.g. 127"
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F] mt-2"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-2">ISO Speed</label>
                  <input
                    type="number"
                    value={iso}
                    onChange={(e) => setIso(e.target.value)}
                    placeholder="400"
                    min="1"
                    className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 rounded-sm focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-neutral-800 border border-neutral-700 p-3 md:p-4">
            <p className="text-xs md:text-sm text-neutral-400">
              <strong className="text-white">Note:</strong> Your edit will be reviewed by admins before going live.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-3 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Submitting...' : 'Submit for Review'}
            </button>
            <button
              onClick={onClose}
              disabled={uploading}
              className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
