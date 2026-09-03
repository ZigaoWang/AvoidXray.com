'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { CAMERA_TYPES, FILM_TYPES, FORMATS } from '@/lib/constants'
import { COLOR_BALANCES, FILM_PROCESSES } from '@/lib/filmFields'
import { useRouter } from 'next/navigation'
import { useToast } from './ui/Toast'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import type { FilmStockOption } from '@/lib/filmSearch'


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
  defaultFilmStockId?: string | null
  // Film props
  filmType?: string | null
  iso?: number | null
  exposures?: string | null
  process?: string | null
  colorBalance?: string | null
  manufacturer?: string | null
  aliases?: string[]
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
  defaultFilmStockId: initialDefaultFilmStockId,
  filmType: initialFilmType,
  iso: initialIso,
  exposures: initialExposures,
  process: initialProcess,
  colorBalance: initialColorBalance,
  manufacturer: initialManufacturer,
  aliases: initialAliases,
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
  const [defaultFilmStockId, setDefaultFilmStockId] = useState(initialDefaultFilmStockId || '')
  const [filmStocks, setFilmStocks] = useState<FilmStockOption[]>([])

  // Film fields
  const [filmType, setFilmType] = useState(initialFilmType || '')
  const [iso, setIso] = useState(initialIso?.toString() || '')
  const [exposures, setExposures] = useState(initialExposures || '')
  const [filmProcess, setFilmProcess] = useState(initialProcess || '')
  const [colorBalance, setColorBalance] = useState(initialColorBalance || '')
  const [manufacturer, setManufacturer] = useState(initialManufacturer || '')
  const [aliases, setAliases] = useState((initialAliases ?? []).join(', '))

  // Custom "Other" values
  const [customCameraType, setCustomCameraType] = useState('')
  const [customFormat, setCustomFormat] = useState('')
  const [customFilmType, setCustomFilmType] = useState('')

  const isDisposable = cameraType === 'Disposable' || initialCameraType === 'Disposable'

  useEffect(() => {
    if (type === 'camera' && isDisposable) {
      fetch('/api/filmstocks')
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setFilmStocks(data) })
        .catch(() => {})
    }
  }, [type, isDisposable])

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-900 border border-neutral-800 p-8 max-w-md w-full">
          <h2 className="text-xl font-bold text-white mb-4">Sign in required</h2>
          <p className="text-neutral-400 mb-6">
            You need to sign in to suggest edits.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => router.push('/login')} fullWidth>
              Sign in
            </Button>
            <Button onClick={onClose} variant="secondary" fullWidth>
              Cancel
            </Button>
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
      ? (cameraType || format || year || defaultFilmStockId)
      : (filmType || format || iso || exposures || filmProcess || colorBalance || manufacturer || aliases)

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
        if (defaultFilmStockId) formData.append('defaultFilmStockId', defaultFilmStockId)
      } else {
        const finalFilmType = filmType === 'Other' ? customFilmType : filmType
        const finalFormat = format === 'Other' ? customFormat : format

        if (finalFilmType) formData.append('filmType', finalFilmType)
        if (finalFormat) formData.append('format', finalFormat)
        if (iso) formData.append('iso', iso)
        if (exposures.trim()) formData.append('exposures', exposures.trim())
        if (filmProcess) formData.append('process', filmProcess)
        if (colorBalance) formData.append('colorBalance', colorBalance)
        if (manufacturer.trim()) formData.append('manufacturer', manufacturer.trim())
        if (aliases.trim()) formData.append('aliases', aliases.trim())
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
    } catch (error) {
      console.error('Submit error:', error)
      toast(error instanceof Error ? error.message : 'Failed to submit edit', 'error')
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
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-4 flex-shrink-0 text-neutral-500 hover:text-white
                         focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
                         focus-visible:outline-[#D32F2F]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4 md:space-y-6">
          {/* Current Image */}
          {currentImage && (
            <div>
              <FieldLabel>Current image</FieldLabel>
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
            <FieldLabel>
              {currentImage ? 'Replace Image' : 'Upload Image'}
            </FieldLabel>
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
              <FieldLabel>Preview</FieldLabel>
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
            <FieldLabel>
              Description
            </FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Tell users about this ${type}…`}
              className={`${fieldClass} resize-none`}
              rows={4}
            />
          </div>

          {/* Camera Categorization Fields */}
          {type === 'camera' && (
            <div className="bg-neutral-800 border border-neutral-800">
              <div className="border-b border-neutral-700 px-4 py-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Camera Details</h3>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <select
                      value={cameraType}
                      onChange={(e) => setCameraType(e.target.value)}
                      className={`${fieldClass}`}
                    >
                      <option value="">Select type…</option>
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
                        className={`${fieldClass} mt-2`}
                      />
                    )}
                  </div>

                  <div>
                    <FieldLabel>Format</FieldLabel>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className={`${fieldClass}`}
                    >
                      <option value="">Select format…</option>
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
                        className={`${fieldClass} mt-2`}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <FieldLabel>Year released</FieldLabel>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="1990"
                    min="1800"
                    max={new Date().getFullYear()}
                    className={`${fieldClass}`}
                  />
                </div>

                {isDisposable && filmStocks.length > 0 && (
                  <div>
                    <FieldLabel>Preloaded film</FieldLabel>
                    <select
                      value={defaultFilmStockId}
                      onChange={(e) => setDefaultFilmStockId(e.target.value)}
                      className={`${fieldClass}`}
                    >
                      <option value="">Select film stock…</option>
                      {filmStocks.map((fs) => (
                        <option key={fs.id} value={fs.id}>
                          {fs.brand ? `${fs.brand} ${fs.name}` : fs.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Film Categorization Fields */}
          {type === 'filmstock' && (
            <div className="bg-neutral-800 border border-neutral-800">
              <div className="border-b border-neutral-700 px-4 py-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Film Details</h3>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Process</FieldLabel>
                    <select
                      value={filmProcess}
                      onChange={(e) => setFilmProcess(e.target.value)}
                      className={`${fieldClass}`}
                    >
                      <option value="">Select process…</option>
                      {FILM_PROCESSES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Color balance</FieldLabel>
                    <select
                      value={colorBalance}
                      onChange={(e) => setColorBalance(e.target.value)}
                      className={`${fieldClass}`}
                    >
                      <option value="">Unknown</option>
                      {COLOR_BALANCES.map((b) => (
                        <option key={b} value={b}>{b === 'N/A' ? 'Not applicable (B&W)' : b}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Manufacturer</FieldLabel>
                    <input
                      type="text"
                      value={manufacturer}
                      onChange={(e) => setManufacturer(e.target.value)}
                      placeholder="e.g. Kodak"
                      className={`${fieldClass}`}
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      Also known as
                    </FieldLabel>
                    <input
                      type="text"
                      value={aliases}
                      onChange={(e) => setAliases(e.target.value)}
                      placeholder="5219, 7219, VISION3 500T"
                      className={`${fieldClass}`}
                    />
                    <p className="text-[11px] text-neutral-600 mt-1.5">
                      Alternate names and product codes, separated by commas
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <select
                      value={filmType}
                      onChange={(e) => setFilmType(e.target.value)}
                      className={`${fieldClass}`}
                    >
                      <option value="">Select type…</option>
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
                        className={`${fieldClass} mt-2`}
                      />
                    )}
                  </div>

                  <div>
                    <FieldLabel>Format</FieldLabel>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className={`${fieldClass}`}
                    >
                      <option value="">Select format…</option>
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
                        className={`${fieldClass} mt-2`}
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>ISO speed</FieldLabel>
                    <input
                      type="number"
                      value={iso}
                      onChange={(e) => setIso(e.target.value)}
                      placeholder="400"
                      min="1"
                      className={`${fieldClass}`}
                    />
                  </div>
                  <div>
                    <FieldLabel>Exposures</FieldLabel>
                    <input
                      type="text"
                      value={exposures}
                      onChange={(e) => setExposures(e.target.value)}
                      placeholder="36"
                      className={`${fieldClass}`}
                    />
                  </div>
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
            <Button
              onClick={handleSubmit}
              disabled={uploading} className="flex-1">
              {uploading ? 'Submitting…' : 'Submit for Review'}
            </Button>
            <Button onClick={onClose} disabled={uploading} variant="secondary">
              Cancel
            </Button>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
