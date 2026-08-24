'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import FieldLabel from '@/components/ui/FieldLabel'

type Suggestion = {
  id: string
  name: string
  brand: string | null
  iso?: number | null
  imageUrl: string | null
  photoCount: number
  similarity: number
}

type Props = {
  type: 'camera' | 'filmstock'
  name: string
  brand: string
  onSelect: (id: string) => void
  onCreate: (withInfo?: { image: File; description: string }) => void
  onCancel: () => void
}

export default function DuplicateCheckModal({ type, name, brand, onSelect, onCreate, onCancel }: Props) {
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showAddInfo, setShowAddInfo] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    checkDuplicates()
  }, [])

  const checkDuplicates = async () => {
    try {
      const endpoint = type === 'camera'
        ? '/api/cameras/check-duplicates'
        : '/api/filmstocks/check-duplicates'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, brand })
      })

      if (!res.ok) throw new Error('Failed to check')

      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch (error) {
      console.error('Duplicate check error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handleCreateWithInfo = () => {
    if (imageFile) {
      onCreate({ image: imageFile, description })
    } else {
      onCreate()
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-900 border border-neutral-800 p-8 max-w-md w-full text-center">
          <p className="text-neutral-400">Checking for duplicates...</p>
        </div>
      </div>
    )
  }

  if (showAddInfo) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-neutral-900 border border-neutral-800 p-6 max-w-2xl w-full my-8">
          <h2 className="text-2xl font-bold text-white mb-2">
            Add Info (Optional)
          </h2>
          <p className="text-neutral-500 text-sm mb-6">
            Help the community by adding an image and description for {brand ? `${brand} ${name}` : name}
          </p>

          <div className="space-y-4">
            {/* Image Upload */}
            <div>
              <FieldLabel>
                Image (PNG with transparent background recommended)
              </FieldLabel>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="block w-full text-sm text-neutral-400
                  file:mr-3 file:py-2 file:px-3
                  file:border-0 file:text-sm file:font-medium
                  file:bg-neutral-800 file:text-white
                  hover:file:bg-neutral-700"
              />
            </div>

            {/* Preview */}
            {previewUrl && (
              <div className="relative aspect-square max-w-xs bg-neutral-800">
                <Image
                  src={previewUrl}
                  alt="Preview"
                  fill
                  className="object-contain"
                />
              </div>
            )}

            {/* Description */}
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`Tell users about this ${type}...`}
                className="w-full bg-neutral-800 text-white p-3 text-sm"
                rows={4}
              />
            </div>

            {/* Info */}
            <div className="bg-neutral-800 border border-neutral-700 p-3 text-xs text-neutral-400">
              Your submission will be reviewed by admins before going live
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleCreateWithInfo}
                className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-3 font-medium"
              >
                {imageFile ? 'Create & Submit Info' : 'Create Without Info'}
              </button>
              <button
                onClick={() => setShowAddInfo(false)}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-3 font-medium"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 p-6 max-w-3xl w-full my-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          {suggestions.length > 0 ? 'Similar Items Found' : 'Create New'}
        </h2>
        <p className="text-neutral-500 text-sm mb-6">
          {suggestions.length > 0
            ? `We found similar ${type === 'camera' ? 'cameras' : 'film stocks'}. Is one of these what you meant?`
            : `No similar items found. You're creating: ${brand ? `${brand} ${name}` : name}`
          }
        </p>

        {suggestions.length > 0 && (
          <div className="space-y-3 mb-6">
            {suggestions.map(suggestion => (
              <button
                key={suggestion.id}
                onClick={() => onSelect(suggestion.id)}
                className="w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 p-4 text-left flex items-center gap-4"
              >
                {suggestion.imageUrl ? (
                  <div className="relative w-16 h-16 bg-neutral-900 flex-shrink-0">
                    <Image
                      src={suggestion.imageUrl}
                      alt={suggestion.name}
                      fill
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-neutral-900 flex-shrink-0" />
                )}

                <div className="flex-1">
                  <div className="font-medium text-white">
                    {suggestion.brand ? `${suggestion.brand} ${suggestion.name}` : suggestion.name}
                  </div>
                  {suggestion.iso && (
                    <div className="text-sm text-neutral-500">ISO {suggestion.iso}</div>
                  )}
                  <div className="text-xs text-neutral-600">
                    {suggestion.photoCount} photos • {suggestion.similarity}% match
                  </div>
                </div>

                <div className="text-neutral-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-neutral-800 pt-6 space-y-3">
          <p className="text-sm text-neutral-400 mb-3">
            {suggestions.length > 0
              ? "None of these match? Create a new entry instead:"
              : "Would you like to add an image and description?"
            }
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setShowAddInfo(true)}
              className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-3 font-medium"
            >
              Add Info & Create
            </button>
            <button
              onClick={() => onCreate()}
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-3 font-medium"
            >
              Create Without Info
            </button>
            <button
              onClick={onCancel}
              className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-3 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
