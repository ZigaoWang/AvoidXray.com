'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Combobox from '@/components/Combobox'
import { CAMERA_TYPES, FILM_TYPES, FORMATS } from '@/lib/constants'
import { COLOR_BALANCES, FILM_PROCESSES } from '@/lib/filmFields'
import type { NewItemPayload } from '@/lib/newItemForm'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import type { FilmStockOption } from '@/lib/filmSearch'


type Props = {
  type: 'camera' | 'film'
  initialName?: string
  onSubmit: (data: NewItemPayload) => void
  onCancel: () => void
  loading?: boolean
  error?: string | null
  filmStocks?: FilmStockOption[]
}

export default function NewItemModal({ type, initialName = '', onSubmit, onCancel, loading = false, error, filmStocks = [] }: Props) {
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
  const [manufacturer, setManufacturer] = useState('')
  const [filmProcess, setFilmProcess] = useState('')
  const [colorBalance, setColorBalance] = useState('')
  const [aliases, setAliases] = useState('')
  const [exposures, setExposures] = useState('')

  // Disposable camera default film
  const [defaultFilmStockId, setDefaultFilmStockId] = useState('')

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

  /**
   * The fields the film form marks required really are required — process is
   * NOT NULL in the database, and the create endpoint rejects a request
   * without a manufacturer it can resolve. Gating the button here means the
   * requirement is visible before submitting rather than coming back as an
   * error afterwards.
   */
  const missingRequired =
    type === 'film' && (!filmProcess || !manufacturer.trim())
  const canSubmit = !!name.trim() && !missingRequired && !loading

  const handleSubmit = () => {
    if (!canSubmit) return

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
            format: finalCameraType === 'Disposable' ? '35mm' : (finalFormat || undefined),
            year: year || undefined,
            defaultFilmStockId: defaultFilmStockId || undefined,
          }
        : {
            filmType: finalFilmType || undefined,
            format: finalFormat || undefined,
            iso: iso || undefined,
            manufacturer: manufacturer || undefined,
            process: filmProcess || undefined,
            colorBalance: colorBalance || undefined,
            aliases: aliases || undefined,
            exposures: exposures || undefined,
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
              type="button"
              onClick={onCancel}
              disabled={loading}
              aria-label="Close"
              className="ml-4 flex-shrink-0 text-neutral-500 hover:text-white disabled:opacity-50
                         focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
                         focus-visible:outline-[#D32F2F]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
              <FieldLabel required>{typeLabel} name</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'camera' ? 'e.g. Canon AE-1, Leica M6…' : 'e.g. Portra 400, HP5 Plus…'}
                className={`${fieldClass}`}
                autoFocus
                disabled={loading}
              />
            </div>

            {/* Image Upload */}
            <div>
              <FieldLabel>Upload image</FieldLabel>
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
                <FieldLabel>Preview</FieldLabel>
                <div className="relative aspect-square w-full max-w-[200px] bg-neutral-800">
                  <Image src={previewUrl} alt="Preview" fill className="object-contain" />
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`Tell users about this ${type}…`}
                className={`${fieldClass} resize-none`}
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
                      <FieldLabel>Type</FieldLabel>
                      <select
                        value={cameraType}
                        onChange={(e) => {
                          setCameraType(e.target.value)
                          if (e.target.value === 'Disposable') {
                            setFormat('35mm')
                            setYear('')
                          }
                        }}
                        disabled={loading}
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
                          disabled={loading}
                          className={`${fieldClass} mt-2`}
                        />
                      )}
                    </div>
                    {cameraType !== 'Disposable' && (
                    <div>
                      <FieldLabel>Format</FieldLabel>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        disabled={loading}
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
                          disabled={loading}
                          className={`${fieldClass} mt-2`}
                        />
                      )}
                    </div>
                    )}
                  </div>

                  {cameraType === 'Disposable' && filmStocks.length > 0 && (
                    <Combobox
                      options={filmStocks}
                      value={defaultFilmStockId}
                      onChange={setDefaultFilmStockId}
                      placeholder="e.g. Kodak Gold 800"
                      label="Pre-loaded Film Stock"
                    />
                  )}

                  {cameraType !== 'Disposable' && (
                  <div>
                    <FieldLabel>Year released</FieldLabel>
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="e.g. 1976"
                      min="1800"
                      max={new Date().getFullYear()}
                      disabled={loading}
                      className={`${fieldClass}`}
                    />
                  </div>
                  )}
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
                      <FieldLabel required>Process</FieldLabel>
                      <select
                        value={filmProcess}
                        onChange={(e) => setFilmProcess(e.target.value)}
                        disabled={loading}
                        className={`${fieldClass}`}
                      >
                        <option value="">Select process…</option>
                        {FILM_PROCESSES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel required>Manufacturer</FieldLabel>
                      <input
                        type="text"
                        value={manufacturer}
                        onChange={(e) => setManufacturer(e.target.value)}
                        placeholder="e.g. Kodak"
                        disabled={loading}
                        className={`${fieldClass}`}
                      />
                    </div>
                    <div>
                      <FieldLabel>Color balance</FieldLabel>
                      <select
                        value={colorBalance}
                        onChange={(e) => setColorBalance(e.target.value)}
                        disabled={loading}
                        className={`${fieldClass}`}
                      >
                        <option value="">Unknown</option>
                        {COLOR_BALANCES.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel hint="(comma separated)">Also known as</FieldLabel>
                      <input
                        type="text"
                        value={aliases}
                        onChange={(e) => setAliases(e.target.value)}
                        placeholder="e.g. 5219, 7219, VISION3 500T"
                        disabled={loading}
                        className={`${fieldClass}`}
                      />
                    </div>
                    <div>
                      <FieldLabel>Type</FieldLabel>
                      <select
                        value={filmType}
                        onChange={(e) => setFilmType(e.target.value)}
                        disabled={loading}
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
                          disabled={loading}
                          className={`${fieldClass} mt-2`}
                        />
                      )}
                    </div>
                    <div>
                      <FieldLabel>Format</FieldLabel>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        disabled={loading}
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
                          disabled={loading}
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
                        placeholder="e.g. 400"
                        min="1"
                        disabled={loading}
                        className={`${fieldClass}`}
                      />
                    </div>
                    <div>
                      <FieldLabel>Exposures</FieldLabel>
                      <input
                        type="text"
                        value={exposures}
                        onChange={(e) => setExposures(e.target.value)}
                        placeholder="e.g. 36"
                        disabled={loading}
                        className={`${fieldClass}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit} className="flex-1">
                {loading ? 'Creating…' : `Create ${typeLabel}`}
              </Button>
              <Button
                onClick={onCancel}
                disabled={loading} variant="secondary">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
