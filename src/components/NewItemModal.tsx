'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

type Props = {
  type: 'camera' | 'film'
  initialName?: string
  onSubmit: (data: {
    name: string
    description?: string
    image?: File
    cameraType?: string
    format?: string
    year?: string
    filmType?: string
    iso?: string
  }) => void
  onCancel: () => void
  loading?: boolean
  error?: string | null
}

const CAMERA_TYPES = ['SLR', 'Rangefinder', 'Point & Shoot', 'TLR', 'Medium Format', 'Large Format', 'Instant']
const FILM_TYPES = ['Color Negative', 'Black & White', 'Slide', 'Instant']
const FORMATS = ['35mm', '120', '4x5', '8x10', 'Instant']

export default function NewItemModal({ type, initialName = '', onSubmit, onCancel, loading = false, error }: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Camera fields
  const [cameraType, setCameraType] = useState('')
  const [format, setFormat] = useState('')
  const [year, setYear] = useState('')

  // Film fields
  const [filmType, setFilmType] = useState('')
  const [iso, setIso] = useState('')

  // Custom "Other" values
  const [customCameraType, setCustomCameraType] = useState('')
  const [customFormat, setCustomFormat] = useState('')
  const [customFilmType, setCustomFilmType] = useState('')

  const typeLabel = type === 'camera' ? 'Camera' : 'Film Stock'

  // Clean up object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return
    }

    // Revoke old URL to prevent memory leak
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleSubmit = () => {
    if (!name.trim() || loading) return

    const finalCameraType = cameraType === 'Other' ? customCameraType : cameraType
    const finalFormat = format === 'Other' ? customFormat : format
    const finalFilmType = filmType === 'Other' ? customFilmType : filmType

    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      image: imageFile || undefined,
      ...(type === 'camera'
        ? {
            cameraType: finalCameraType || undefined,
            format: finalFormat || undefined,
            year: year || undefined,
          }
        : {
            filmType: finalFilmType || undefined,
            format: finalFormat || undefined,
            iso: iso || undefined,
          }),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-6">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl my-4 md:my-8">
        <div className="p-4 md:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white">Add New {typeLabel}</h2>
              <p className="text-neutral-500 text-sm mt-1">Enter details below</p>
            </div>
            <button
              onClick={onCancel}
              disabled={loading}
              className="text-neutral-500 hover:text-white flex-shrink-0 ml-4 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4 md:space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm text-neutral-400 mb-2">{typeLabel} Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'camera' ? 'e.g. Canon AE-1, Leica M6...' : 'e.g. Portra 400, HP5 Plus...'}
                className="w-full bg-neutral-800 text-white p-3 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none"
                autoFocus
                disabled={loading}
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm text-neutral-400 mb-2">Upload Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                disabled={loading}
                className="block w-full text-sm text-neutral-400
                  file:mr-3 file:py-2 file:px-3
                  file:border-0 file:text-sm file:font-medium
                  file:bg-neutral-800 file:text-white
                  hover:file:bg-neutral-700
                  disabled:opacity-50"
              />
              <p className="text-xs text-neutral-600 mt-1">PNG with transparent background recommended</p>
            </div>

            {/* Preview */}
            {previewUrl && (
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Preview</label>
                <div className="relative aspect-square w-full max-w-[200px] bg-neutral-800">
                  <Image src={previewUrl} alt="Preview" fill className="object-contain" />
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm text-neutral-400 mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`Tell users about this ${type}...`}
                className="w-full bg-neutral-800 text-white p-3 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none resize-none"
                rows={4}
                disabled={loading}
              />
            </div>

            {/* Camera Details */}
            {type === 'camera' && (
              <div className="bg-neutral-800 border border-neutral-700">
                <div className="border-b border-neutral-700 px-4 py-3">
                  <h3 className="text-sm font-medium text-white">Camera Details</h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-2">Type</label>
                      <select
                        value={cameraType}
                        onChange={(e) => setCameraType(e.target.value)}
                        disabled={loading}
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none"
                      >
                        <option value="">Select type...</option>
                        {CAMERA_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                      {cameraType === 'Other' && (
                        <input
                          type="text"
                          value={customCameraType}
                          onChange={(e) => setCustomCameraType(e.target.value)}
                          placeholder="e.g. Pinhole"
                          disabled={loading}
                          className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none mt-2"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-2">Format</label>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        disabled={loading}
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none"
                      >
                        <option value="">Select format...</option>
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                      {format === 'Other' && (
                        <input
                          type="text"
                          value={customFormat}
                          onChange={(e) => setCustomFormat(e.target.value)}
                          placeholder="e.g. 127"
                          disabled={loading}
                          className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none mt-2"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-2">Year Released</label>
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="e.g. 1976"
                      min="1800"
                      max={new Date().getFullYear()}
                      disabled={loading}
                      className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Film Details */}
            {type === 'film' && (
              <div className="bg-neutral-800 border border-neutral-700">
                <div className="border-b border-neutral-700 px-4 py-3">
                  <h3 className="text-sm font-medium text-white">Film Details</h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-2">Type</label>
                      <select
                        value={filmType}
                        onChange={(e) => setFilmType(e.target.value)}
                        disabled={loading}
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none"
                      >
                        <option value="">Select type...</option>
                        {FILM_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                      {filmType === 'Other' && (
                        <input
                          type="text"
                          value={customFilmType}
                          onChange={(e) => setCustomFilmType(e.target.value)}
                          placeholder="e.g. Infrared"
                          disabled={loading}
                          className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none mt-2"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-2">Format</label>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        disabled={loading}
                        className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none"
                      >
                        <option value="">Select format...</option>
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                      {format === 'Other' && (
                        <input
                          type="text"
                          value={customFormat}
                          onChange={(e) => setCustomFormat(e.target.value)}
                          placeholder="e.g. 127"
                          disabled={loading}
                          className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none mt-2"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-2">ISO Speed</label>
                    <input
                      type="number"
                      value={iso}
                      onChange={(e) => setIso(e.target.value)}
                      placeholder="e.g. 400"
                      min="1"
                      disabled={loading}
                      className="w-full bg-neutral-900 text-white px-3 py-2.5 text-sm border border-neutral-700 focus:border-[#D32F2F] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || loading}
                className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Creating...' : `Create ${typeLabel}`}
              </button>
              <button
                onClick={onCancel}
                disabled={loading}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 text-sm font-medium transition-colors disabled:opacity-50"
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
